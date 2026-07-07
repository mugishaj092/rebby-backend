import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { createApp } from '@/app';
import { signAccessToken } from '@/core/security/jwt';
import { prisma } from '@/db/prisma';
import { productsRepository } from '@/features/products/repository';
import * as productsService from '@/features/products/service';
import { StaffRole } from '@/generated/prisma/enums';

function uniqueName(prefix = 'Product'): string {
  return `${prefix} ${randomUUID()}`;
}

function uniqueSku(prefix = 'SKU'): string {
  return `${prefix}-${randomUUID()}`;
}

function staffToken(role: StaffRole = StaffRole.staff): string {
  return signAccessToken({
    sub: randomUUID(),
    type: 'staff',
    email: `${randomUUID()}@example.com`,
    role,
  });
}

describe('features/products public listing & detail routes', () => {
  const app = createApp();
  const createdProductIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdCollectionIds: string[] = [];

  afterAll(async () => {
    await prisma.collectionProduct.deleteMany({
      where: { collectionId: { in: createdCollectionIds } },
    });
    await prisma.collection.deleteMany({ where: { id: { in: createdCollectionIds } } });
    await prisma.productVariant.deleteMany({ where: { productId: { in: createdProductIds } } });
    await prisma.productImage.deleteMany({ where: { productId: { in: createdProductIds } } });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.$disconnect();
  });

  async function createCategoryViaApi(): Promise<string> {
    const response = await request(app)
      .post('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${staffToken()}`)
      .send({ name: uniqueName('Category') });
    createdCategoryIds.push(response.body.data.id);
    return response.body.data.id as string;
  }

  async function createCollectionViaApi(overrides: Record<string, unknown> = {}): Promise<string> {
    const response = await request(app)
      .post('/api/v1/admin/collections')
      .set('Authorization', `Bearer ${staffToken()}`)
      .send({ name: uniqueName('Collection'), ...overrides });
    createdCollectionIds.push(response.body.data.id);
    return response.body.data.id as string;
  }

  async function createProductViaApi(
    overrides: Record<string, unknown> = {},
  ): Promise<request.Response> {
    const response = await request(app)
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${staffToken()}`)
      .send({
        name: uniqueName(),
        basePrice: '19.99',
        variants: [{ size: 'M', color: 'Black', sku: uniqueSku(), stock: 10 }],
        ...overrides,
      });
    createdProductIds.push(response.body.data.id);
    return response;
  }

  async function deactivateProduct(id: string): Promise<void> {
    await prisma.product.update({ where: { id }, data: { isActive: false } });
  }

  async function softDeleteProductViaApi(id: string): Promise<void> {
    await request(app)
      .delete(`/api/v1/admin/products/${id}`)
      .set('Authorization', `Bearer ${staffToken(StaffRole.manager)}`);
  }

  describe('GET /api/v1/products', () => {
    it('works unauthenticated', async () => {
      const response = await request(app).get('/api/v1/products');
      expect(response.status).toBe(200);
    });

    it('excludes inactive and soft-deleted products from the listing', async () => {
      const categoryId = await createCategoryViaApi();
      const active = await createProductViaApi({ categoryId });
      const deactivated = await createProductViaApi({ categoryId });
      const softDeleted = await createProductViaApi({ categoryId });

      await deactivateProduct(deactivated.body.data.id);
      await softDeleteProductViaApi(softDeleted.body.data.id);

      const response = await request(app).get(`/api/v1/categories/${categoryId}/products?limit=50`);

      const ids = (response.body.data.items as { id: string }[]).map((item) => item.id);
      expect(ids).toContain(active.body.data.id);
      expect(ids).not.toContain(deactivated.body.data.id);
      expect(ids).not.toContain(softDeleted.body.data.id);
    });

    it('derives inStock from whether any variant has stock > 0', async () => {
      const inStockProduct = await createProductViaApi({
        variants: [{ size: 'M', color: 'Red', sku: uniqueSku(), stock: 5 }],
      });
      const outOfStockProduct = await createProductViaApi({
        variants: [{ size: 'M', color: 'Blue', sku: uniqueSku(), stock: 0 }],
      });

      const response = await request(app).get('/api/v1/products?limit=50');
      const items = response.body.data.items as { id: string; inStock: boolean }[];

      expect(items.find((item) => item.id === inStockProduct.body.data.id)?.inStock).toBe(true);
      expect(items.find((item) => item.id === outOfStockProduct.body.data.id)?.inStock).toBe(false);
    });

    it('rejects an invalid limit', async () => {
      const response = await request(app).get('/api/v1/products?limit=0');
      expect(response.status).toBe(422);
    });

    it('rejects supplying both categoryId and collectionId', async () => {
      const response = await request(app).get(
        `/api/v1/products?categoryId=${randomUUID()}&collectionId=${randomUUID()}`,
      );
      expect(response.status).toBe(422);
    });

    it('forwards an unexpected repository error to the error handler', async () => {
      const spy = vi
        .spyOn(productsRepository, 'listProducts')
        .mockRejectedValueOnce(new Error('unexpected db failure'));

      try {
        const response = await request(app).get('/api/v1/products');
        expect(response.status).toBe(500);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('GET /api/v1/products/:idOrSlug', () => {
    it('returns full detail including category, images, and every variant', async () => {
      const categoryId = await createCategoryViaApi();
      const product = await createProductViaApi({
        categoryId,
        images: [{ url: 'https://example.com/a.png', isPrimary: true }],
        variants: [
          { size: 'S', color: 'Black', sku: uniqueSku(), stock: 3 },
          { size: 'M', color: 'Black', sku: uniqueSku(), stock: 7 },
        ],
      });

      const response = await request(app).get(`/api/v1/products/${product.body.data.id}`);

      expect(response.status).toBe(200);
      expect(response.body.data.category.id).toBe(categoryId);
      expect(response.body.data.images).toHaveLength(1);
      expect(response.body.data.variants).toHaveLength(2);
    });

    it('resolves by slug as well as by id', async () => {
      const product = await createProductViaApi();

      const response = await request(app).get(`/api/v1/products/${product.body.data.slug}`);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(product.body.data.id);
    });

    it('reflects a direct DB stock update made mid-test (confirms live, not cached, stock)', async () => {
      const product = await createProductViaApi({
        variants: [{ size: 'M', color: 'Black', sku: uniqueSku(), stock: 10 }],
      });
      const variantId = product.body.data.variants[0].id as string;

      const first = await request(app).get(`/api/v1/products/${product.body.data.id}`);
      expect(first.body.data.variants[0].stock).toBe(10);

      await prisma.productVariant.update({ where: { id: variantId }, data: { stock: 2 } });

      const second = await request(app).get(`/api/v1/products/${product.body.data.id}`);
      expect(second.body.data.variants[0].stock).toBe(2);
    });

    it('returns 404 for a soft-deleted product instead of the product data', async () => {
      const product = await createProductViaApi();
      await softDeleteProductViaApi(product.body.data.id);

      const response = await request(app).get(`/api/v1/products/${product.body.data.id}`);
      expect(response.status).toBe(404);
    });

    it('returns 404 for an inactive (but not deleted) product', async () => {
      const product = await createProductViaApi();
      await deactivateProduct(product.body.data.id);

      const response = await request(app).get(`/api/v1/products/${product.body.data.id}`);
      expect(response.status).toBe(404);
    });

    it('returns 404 for a nonexistent product', async () => {
      const response = await request(app).get(`/api/v1/products/${randomUUID()}`);
      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/v1/categories/:id/products', () => {
    it('returns only products in that category', async () => {
      const categoryA = await createCategoryViaApi();
      const categoryB = await createCategoryViaApi();
      const productInA = await createProductViaApi({ categoryId: categoryA });
      const productInB = await createProductViaApi({ categoryId: categoryB });

      const response = await request(app).get(`/api/v1/categories/${categoryA}/products`);
      const ids = (response.body.data.items as { id: string }[]).map((item) => item.id);

      expect(ids).toContain(productInA.body.data.id);
      expect(ids).not.toContain(productInB.body.data.id);
    });

    it('forwards an unexpected repository error to the error handler', async () => {
      const categoryId = await createCategoryViaApi();
      const spy = vi
        .spyOn(productsRepository, 'listProducts')
        .mockRejectedValueOnce(new Error('unexpected db failure'));

      try {
        const response = await request(app).get(`/api/v1/categories/${categoryId}/products`);
        expect(response.status).toBe(500);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('GET /api/v1/collections/:slug/products', () => {
    it("returns exactly the collection's product set, respecting CollectionProduct.sortOrder", async () => {
      const p1 = await createProductViaApi();
      const p2 = await createProductViaApi();
      const p3 = await createProductViaApi();
      const collectionId = await createCollectionViaApi({
        productIds: [p3.body.data.id, p1.body.data.id, p2.body.data.id],
      });
      const collection = await prisma.collection.findUniqueOrThrow({
        where: { id: collectionId },
      });

      const response = await request(app).get(`/api/v1/collections/${collection.slug}/products`);

      expect(response.status).toBe(200);
      const ids = (response.body.data.items as { id: string }[]).map((item) => item.id);
      expect(ids).toEqual([p3.body.data.id, p1.body.data.id, p2.body.data.id]);
    });

    it('returns 404 for a nonexistent collection slug', async () => {
      const response = await request(app).get('/api/v1/collections/does-not-exist-slug/products');
      expect(response.status).toBe(404);
    });

    it('paginates a collection-scoped listing using cursor, same as a plain listing', async () => {
      const p1 = await createProductViaApi();
      const p2 = await createProductViaApi();
      const p3 = await createProductViaApi();
      const collectionId = await createCollectionViaApi({
        productIds: [p1.body.data.id, p2.body.data.id, p3.body.data.id],
      });
      const collection = await prisma.collection.findUniqueOrThrow({
        where: { id: collectionId },
      });

      const firstPage = await request(app).get(
        `/api/v1/collections/${collection.slug}/products?limit=2`,
      );
      expect(firstPage.status).toBe(200);
      expect(firstPage.body.data.items).toHaveLength(2);
      expect(firstPage.body.data.nextCursor).not.toBeNull();

      const secondPage = await request(app).get(
        `/api/v1/collections/${collection.slug}/products?limit=2&cursor=${firstPage.body.data.nextCursor}`,
      );
      expect(secondPage.status).toBe(200);
      expect(secondPage.body.data.items).toHaveLength(1);
      expect(secondPage.body.data.nextCursor).toBeNull();

      const firstPageIds = (firstPage.body.data.items as { id: string }[]).map((item) => item.id);
      const secondPageIds = (secondPage.body.data.items as { id: string }[]).map((item) => item.id);
      expect([...firstPageIds, ...secondPageIds].sort()).toEqual(
        [p1.body.data.id, p2.body.data.id, p3.body.data.id].sort(),
      );
    });
  });

  describe('productsService.listProducts (unit)', () => {
    it('falls back nextCursor to null if the repository ever reports hasMore on an empty page', async () => {
      // Defensive-only branch: in practice `hasMore` can't be true with zero items (hasMore is
      // rows.length > limit, and limit >= 1), but the fallback exists so a future repository
      // change can't silently return an invalid cursor.
      const spy = vi
        .spyOn(productsRepository, 'listProducts')
        .mockResolvedValueOnce({ items: [], hasMore: true });

      try {
        const page = await productsService.listProducts({ limit: 20 });
        expect(page.nextCursor).toBeNull();
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('pagination boundary (25 products, limit=20)', () => {
    it('returns 20 on the first page and the remaining 5 on the second, with no duplicates or gaps', async () => {
      const categoryId = await createCategoryViaApi();
      const createdIds: string[] = [];
      for (let i = 0; i < 25; i += 1) {
        const product = await createProductViaApi({ categoryId });
        createdIds.push(product.body.data.id as string);
      }

      const firstPage = await request(app).get(
        `/api/v1/categories/${categoryId}/products?limit=20`,
      );
      expect(firstPage.status).toBe(200);
      expect(firstPage.body.data.items).toHaveLength(20);
      expect(firstPage.body.data.nextCursor).not.toBeNull();

      const secondPage = await request(app).get(
        `/api/v1/categories/${categoryId}/products?limit=20&cursor=${firstPage.body.data.nextCursor}`,
      );
      expect(secondPage.status).toBe(200);
      expect(secondPage.body.data.items).toHaveLength(5);
      expect(secondPage.body.data.nextCursor).toBeNull();

      const firstPageIds = (firstPage.body.data.items as { id: string }[]).map((item) => item.id);
      const secondPageIds = (secondPage.body.data.items as { id: string }[]).map((item) => item.id);
      const combined = [...firstPageIds, ...secondPageIds];

      expect(new Set(combined).size).toBe(25);
      expect(combined.sort()).toEqual([...createdIds].sort());
    });
  });
});
