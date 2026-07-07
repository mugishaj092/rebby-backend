import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { signAccessToken } from '@/core/security/jwt';
import { prisma } from '@/db/prisma';
import { StaffRole } from '@/generated/prisma/enums';

function uniqueName(prefix = 'Product'): string {
  return `${prefix} ${randomUUID()}`;
}

function uniqueSku(prefix = 'SKU'): string {
  return `${prefix}-${randomUUID()}`;
}

function uniqueWord(prefix: string): string {
  return `${prefix}${randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

function staffToken(role: StaffRole = StaffRole.staff): string {
  return signAccessToken({
    sub: randomUUID(),
    type: 'staff',
    email: `${randomUUID()}@example.com`,
    role,
  });
}

describe('spec 11 — filtering & sorting (shared across catalog + discovery)', () => {
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

  async function createCollectionViaApi(overrides: Record<string, unknown> = {}): Promise<{
    id: string;
    slug: string;
  }> {
    const response = await request(app)
      .post('/api/v1/admin/collections')
      .set('Authorization', `Bearer ${staffToken()}`)
      .send({ name: uniqueName('Collection'), ...overrides });
    createdCollectionIds.push(response.body.data.id);
    return { id: response.body.data.id as string, slug: response.body.data.slug as string };
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

  describe('combined filter intersection (category + size + price range)', () => {
    it('returns only products matching every filter, not just some', async () => {
      const categoryA = await createCategoryViaApi();
      const categoryB = await createCategoryViaApi();

      const matchesAll = await createProductViaApi({
        categoryId: categoryA,
        basePrice: '15.00',
        variants: [{ size: 'M', color: 'Black', sku: uniqueSku(), stock: 5 }],
      });
      const wrongSize = await createProductViaApi({
        categoryId: categoryA,
        basePrice: '15.00',
        variants: [{ size: 'L', color: 'Black', sku: uniqueSku(), stock: 5 }],
      });
      const wrongCategory = await createProductViaApi({
        categoryId: categoryB,
        basePrice: '15.00',
        variants: [{ size: 'M', color: 'Black', sku: uniqueSku(), stock: 5 }],
      });
      const wrongPrice = await createProductViaApi({
        categoryId: categoryA,
        basePrice: '25.00',
        variants: [{ size: 'M', color: 'Black', sku: uniqueSku(), stock: 5 }],
      });

      const response = await request(app).get(
        `/api/v1/products?categoryId=${categoryA}&size=M&minPrice=10&maxPrice=20`,
      );

      expect(response.status).toBe(200);
      const ids = (response.body.data.items as { id: string }[]).map((item) => item.id);
      expect(ids).toContain(matchesAll.body.data.id);
      expect(ids).not.toContain(wrongSize.body.data.id);
      expect(ids).not.toContain(wrongCategory.body.data.id);
      expect(ids).not.toContain(wrongPrice.body.data.id);
    });

    it('produces the identical filtered id set on /products and /search for the same filters', async () => {
      const word = uniqueWord('shared');
      const categoryA = await createCategoryViaApi();

      const matchesAll = await createProductViaApi({
        name: `${word} Dress`,
        categoryId: categoryA,
        basePrice: '15.00',
        variants: [{ size: 'M', color: 'Black', sku: uniqueSku(), stock: 5 }],
      });
      const wrongSize = await createProductViaApi({
        name: `${word} Skirt`,
        categoryId: categoryA,
        basePrice: '15.00',
        variants: [{ size: 'L', color: 'Black', sku: uniqueSku(), stock: 5 }],
      });

      const filterQuery = `categoryId=${categoryA}&size=M&minPrice=10&maxPrice=20`;
      const listingResponse = await request(app).get(`/api/v1/products?${filterQuery}&limit=50`);
      const searchResponse = await request(app).get(
        `/api/v1/search?q=${word}&${filterQuery}&limit=50`,
      );

      const listingIds = (listingResponse.body.data.items as { id: string }[])
        .map((item) => item.id)
        .filter((id) => id === matchesAll.body.data.id || id === wrongSize.body.data.id);
      const searchIds = (searchResponse.body.data.items as { id: string }[]).map((item) => item.id);

      expect(listingIds.sort()).toEqual([matchesAll.body.data.id].sort());
      expect(searchIds.sort()).toEqual([matchesAll.body.data.id].sort());
    });
  });

  describe('individual filters in isolation', () => {
    it('availability=in_stock excludes products where every variant has stock 0', async () => {
      const categoryId = await createCategoryViaApi();
      const inStock = await createProductViaApi({
        categoryId,
        variants: [{ size: 'M', color: 'Black', sku: uniqueSku(), stock: 3 }],
      });
      const outOfStock = await createProductViaApi({
        categoryId,
        variants: [{ size: 'M', color: 'Black', sku: uniqueSku(), stock: 0 }],
      });

      const response = await request(app).get(
        `/api/v1/products?categoryId=${categoryId}&availability=in_stock`,
      );

      const ids = (response.body.data.items as { id: string }[]).map((item) => item.id);
      expect(ids).toContain(inStock.body.data.id);
      expect(ids).not.toContain(outOfStock.body.data.id);
    });

    it('newArrivals=true returns only products created within the recent window', async () => {
      const categoryId = await createCategoryViaApi();
      const recent = await createProductViaApi({ categoryId });
      const old = await createProductViaApi({ categoryId });

      await prisma.product.update({
        where: { id: old.body.data.id },
        data: { createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
      });

      const response = await request(app).get(
        `/api/v1/products?categoryId=${categoryId}&newArrivals=true`,
      );

      const ids = (response.body.data.items as { id: string }[]).map((item) => item.id);
      expect(ids).toContain(recent.body.data.id);
      expect(ids).not.toContain(old.body.data.id);
    });

    it('onSale=true returns only products where compareAtPrice > basePrice', async () => {
      const categoryId = await createCategoryViaApi();
      const onSale = await createProductViaApi({
        categoryId,
        basePrice: '20.00',
        compareAtPrice: '30.00',
      });
      const notDiscounted = await createProductViaApi({
        categoryId,
        basePrice: '20.00',
      });
      const compareEqualToBase = await createProductViaApi({
        categoryId,
        basePrice: '20.00',
        compareAtPrice: '20.00',
      });

      const response = await request(app).get(
        `/api/v1/products?categoryId=${categoryId}&onSale=true`,
      );

      const ids = (response.body.data.items as { id: string }[]).map((item) => item.id);
      expect(ids).toContain(onSale.body.data.id);
      expect(ids).not.toContain(notDiscounted.body.data.id);
      expect(ids).not.toContain(compareEqualToBase.body.data.id);
    });
  });

  describe('sort orders', () => {
    it('sort=newest (the default) orders by createdAt DESC', async () => {
      const categoryId = await createCategoryViaApi();
      const first = await createProductViaApi({ categoryId });
      const second = await createProductViaApi({ categoryId });

      const response = await request(app).get(`/api/v1/products?categoryId=${categoryId}`);

      const ids = (response.body.data.items as { id: string }[]).map((item) => item.id);
      expect(ids.indexOf(second.body.data.id)).toBeLessThan(ids.indexOf(first.body.data.id));
    });

    it('sort=price_asc orders ascending by basePrice, tie-broken by id DESC', async () => {
      const categoryId = await createCategoryViaApi();
      const low = await createProductViaApi({ categoryId, basePrice: '10.00' });
      const high = await createProductViaApi({ categoryId, basePrice: '30.00' });
      const tieA = await createProductViaApi({ categoryId, basePrice: '20.00' });
      const tieB = await createProductViaApi({ categoryId, basePrice: '20.00' });

      const response = await request(app).get(
        `/api/v1/products?categoryId=${categoryId}&sort=price_asc`,
      );

      const ids = (response.body.data.items as { id: string }[]).map((item) => item.id);
      expect(ids.indexOf(low.body.data.id)).toBeLessThan(ids.indexOf(tieA.body.data.id));
      expect(ids.indexOf(low.body.data.id)).toBeLessThan(ids.indexOf(tieB.body.data.id));
      expect(ids.indexOf(high.body.data.id)).toBeGreaterThan(ids.indexOf(tieA.body.data.id));
      expect(ids.indexOf(high.body.data.id)).toBeGreaterThan(ids.indexOf(tieB.body.data.id));

      const [expectedFirstTie, expectedSecondTie] = [tieA.body.data.id, tieB.body.data.id].sort(
        (a: string, b: string) => (a < b ? 1 : -1),
      );
      expect(ids.indexOf(expectedFirstTie)).toBeLessThan(ids.indexOf(expectedSecondTie));
    });

    it('sort=price_desc orders descending by basePrice', async () => {
      const categoryId = await createCategoryViaApi();
      const low = await createProductViaApi({ categoryId, basePrice: '10.00' });
      const high = await createProductViaApi({ categoryId, basePrice: '30.00' });

      const response = await request(app).get(
        `/api/v1/products?categoryId=${categoryId}&sort=price_desc`,
      );

      const ids = (response.body.data.items as { id: string }[]).map((item) => item.id);
      expect(ids.indexOf(high.body.data.id)).toBeLessThan(ids.indexOf(low.body.data.id));
    });

    it.each(['best_selling', 'most_popular'] as const)(
      'sort=%s does not crash (falls back cleanly per spec 11 §3)',
      async (sort) => {
        const categoryId = await createCategoryViaApi();
        await createProductViaApi({ categoryId });

        const response = await request(app).get(
          `/api/v1/products?categoryId=${categoryId}&sort=${sort}`,
        );

        expect(response.status).toBe(200);
      },
    );

    it('search respects the same sort param as catalog listing (default newest)', async () => {
      const word = uniqueWord('sortsearch');
      const first = await createProductViaApi({ name: `${word} A` });
      const second = await createProductViaApi({ name: `${word} B` });

      const response = await request(app).get(`/api/v1/search?q=${word}`);

      const ids = (response.body.data.items as { id: string }[]).map((item) => item.id);
      expect(ids.indexOf(second.body.data.id)).toBeLessThan(ids.indexOf(first.body.data.id));
    });
  });

  describe('nested-route filter/sort passthrough (regression: params were previously dropped)', () => {
    it('GET /categories/:id/products honors size/price filters, not just cursor/limit', async () => {
      const categoryId = await createCategoryViaApi();
      const matches = await createProductViaApi({
        categoryId,
        basePrice: '15.00',
        variants: [{ size: 'M', color: 'Black', sku: uniqueSku(), stock: 5 }],
      });
      const wrongSize = await createProductViaApi({
        categoryId,
        basePrice: '15.00',
        variants: [{ size: 'L', color: 'Black', sku: uniqueSku(), stock: 5 }],
      });

      const response = await request(app).get(
        `/api/v1/categories/${categoryId}/products?size=M&minPrice=10&maxPrice=20`,
      );

      expect(response.status).toBe(200);
      const ids = (response.body.data.items as { id: string }[]).map((item) => item.id);
      expect(ids).toContain(matches.body.data.id);
      expect(ids).not.toContain(wrongSize.body.data.id);
    });

    it('GET /categories/:id/products honors sort=price_desc', async () => {
      const categoryId = await createCategoryViaApi();
      const low = await createProductViaApi({ categoryId, basePrice: '10.00' });
      const high = await createProductViaApi({ categoryId, basePrice: '30.00' });

      const response = await request(app).get(
        `/api/v1/categories/${categoryId}/products?sort=price_desc`,
      );

      const ids = (response.body.data.items as { id: string }[]).map((item) => item.id);
      expect(ids.indexOf(high.body.data.id)).toBeLessThan(ids.indexOf(low.body.data.id));
    });

    it('GET /collections/:slug/products honors availability=in_stock while keeping curated sortOrder', async () => {
      const inStock = await createProductViaApi({
        variants: [{ size: 'M', color: 'Black', sku: uniqueSku(), stock: 5 }],
      });
      const outOfStock = await createProductViaApi({
        variants: [{ size: 'M', color: 'Black', sku: uniqueSku(), stock: 0 }],
      });
      const collection = await createCollectionViaApi({
        productIds: [outOfStock.body.data.id, inStock.body.data.id],
      });

      const response = await request(app).get(
        `/api/v1/collections/${collection.slug}/products?availability=in_stock`,
      );

      expect(response.status).toBe(200);
      const ids = (response.body.data.items as { id: string }[]).map((item) => item.id);
      expect(ids).toContain(inStock.body.data.id);
      expect(ids).not.toContain(outOfStock.body.data.id);
    });

    it('GET /collections/:slug/products rejects minPrice greater than maxPrice', async () => {
      const collection = await createCollectionViaApi();

      const response = await request(app).get(
        `/api/v1/collections/${collection.slug}/products?minPrice=50&maxPrice=10`,
      );

      expect(response.status).toBe(422);
    });
  });

  describe('minPrice/maxPrice validation', () => {
    it('rejects minPrice greater than maxPrice on /products', async () => {
      const response = await request(app).get('/api/v1/products?minPrice=50&maxPrice=10');
      expect(response.status).toBe(422);
    });

    it('rejects minPrice greater than maxPrice on /search', async () => {
      const response = await request(app).get(
        `/api/v1/search?q=${uniqueWord('pricecheck')}&minPrice=50&maxPrice=10`,
      );
      expect(response.status).toBe(422);
    });
  });
});
