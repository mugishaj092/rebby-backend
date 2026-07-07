import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { createApp } from '@/app';
import { signAccessToken } from '@/core/security/jwt';
import { prisma } from '@/db/prisma';
import { discoveryRepository } from '@/features/discovery/repository';
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

describe('features/discovery search routes', () => {
  const app = createApp();
  const createdProductIds: string[] = [];

  afterAll(async () => {
    await prisma.productVariant.deleteMany({ where: { productId: { in: createdProductIds } } });
    await prisma.productImage.deleteMany({ where: { productId: { in: createdProductIds } } });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    await prisma.$disconnect();
  });

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

  describe('GET /api/v1/search', () => {
    it('ranks a name match above a description-only match for the same term', async () => {
      const word = uniqueWord('alpha');

      const descriptionMatch = await createProductViaApi({
        name: uniqueName('Plain'),
        description: `A product described using the term ${word} in its body copy.`,
      });
      const nameMatch = await createProductViaApi({
        name: `${word} Jacket`,
      });

      const response = await request(app).get(`/api/v1/search?q=${word}`);

      expect(response.status).toBe(200);
      const ids = (response.body.data.items as { id: string }[]).map((item) => item.id);
      expect(ids).toContain(nameMatch.body.data.id);
      expect(ids).toContain(descriptionMatch.body.data.id);
      expect(ids.indexOf(nameMatch.body.data.id)).toBeLessThan(
        ids.indexOf(descriptionMatch.body.data.id),
      );
    });

    it('finds a product by a distinctive description-only term', async () => {
      const word = uniqueWord('beta');
      const product = await createProductViaApi({
        name: uniqueName('Plain'),
        description: `Made from a rare fabric called ${word}.`,
      });

      const response = await request(app).get(`/api/v1/search?q=${word}`);

      expect(response.status).toBe(200);
      const ids = (response.body.data.items as { id: string }[]).map((item) => item.id);
      expect(ids).toContain(product.body.data.id);
    });

    it('excludes inactive and soft-deleted products from results', async () => {
      const word = uniqueWord('gamma');
      const active = await createProductViaApi({ name: `${word} Shirt` });
      const deactivated = await createProductViaApi({ name: `${word} Shirt Two` });
      const softDeleted = await createProductViaApi({ name: `${word} Shirt Three` });

      await deactivateProduct(deactivated.body.data.id);
      await softDeleteProductViaApi(softDeleted.body.data.id);

      const response = await request(app).get(`/api/v1/search?q=${word}`);
      const ids = (response.body.data.items as { id: string }[]).map((item) => item.id);

      expect(ids).toContain(active.body.data.id);
      expect(ids).not.toContain(deactivated.body.data.id);
      expect(ids).not.toContain(softDeleted.body.data.id);
    });

    it('rejects an empty q', async () => {
      const response = await request(app).get('/api/v1/search?q=');
      expect(response.status).toBe(422);
    });

    it('rejects a whitespace-only q', async () => {
      const response = await request(app).get('/api/v1/search?q=%20%20%20');
      expect(response.status).toBe(422);
    });

    it('rejects a missing q', async () => {
      const response = await request(app).get('/api/v1/search');
      expect(response.status).toBe(422);
    });

    it('returns an empty page when nothing matches', async () => {
      const response = await request(app).get(`/api/v1/search?q=${uniqueWord('nomatch')}`);
      expect(response.status).toBe(200);
      expect(response.body.data.items).toEqual([]);
      expect(response.body.data.nextCursor).toBeNull();
    });

    it('rejects a cursor that is not valid base64url-encoded JSON', async () => {
      const response = await request(app).get(
        `/api/v1/search?q=${uniqueWord('epsilon')}&cursor=%21%21%21not-a-real-cursor%21%21%21`,
      );
      expect(response.status).toBe(422);
    });

    it('rejects a cursor whose decoded JSON has the wrong shape', async () => {
      const badCursor = Buffer.from(JSON.stringify({ foo: 'bar' }), 'utf8').toString('base64url');
      const response = await request(app).get(
        `/api/v1/search?q=${uniqueWord('zeta')}&cursor=${badCursor}`,
      );
      expect(response.status).toBe(422);
    });

    it('includes a non-null compareAtPrice when the matched product has one', async () => {
      const word = uniqueWord('eta');
      const product = await createProductViaApi({
        name: `${word} Coat`,
        compareAtPrice: '99.99',
      });

      const response = await request(app).get(`/api/v1/search?q=${word}`);

      const match = (
        response.body.data.items as { id: string; compareAtPrice: string | null }[]
      ).find((item) => item.id === product.body.data.id);
      expect(match?.compareAtPrice).toBe('99.99');
    });

    describe('pagination (25 matching products, limit=20)', () => {
      it('returns 20 on the first page and the remaining 5 on the second, with no duplicates or gaps', async () => {
        const word = uniqueWord('delta');
        const createdIds: string[] = [];
        for (let i = 0; i < 25; i += 1) {
          const product = await createProductViaApi({ name: `${word} Item ${i}` });
          createdIds.push(product.body.data.id as string);
        }

        const firstPage = await request(app).get(`/api/v1/search?q=${word}&limit=20`);
        expect(firstPage.status).toBe(200);
        expect(firstPage.body.data.items).toHaveLength(20);
        expect(firstPage.body.data.nextCursor).not.toBeNull();

        const secondPage = await request(app).get(
          `/api/v1/search?q=${word}&limit=20&cursor=${encodeURIComponent(firstPage.body.data.nextCursor)}`,
        );
        expect(secondPage.status).toBe(200);
        expect(secondPage.body.data.items).toHaveLength(5);
        expect(secondPage.body.data.nextCursor).toBeNull();

        const firstPageIds = (firstPage.body.data.items as { id: string }[]).map((item) => item.id);
        const secondPageIds = (secondPage.body.data.items as { id: string }[]).map(
          (item) => item.id,
        );
        const combined = [...firstPageIds, ...secondPageIds];

        expect(new Set(combined).size).toBe(25);
        expect(combined.sort()).toEqual([...createdIds].sort());
      });
    });
  });

  describe('GET /api/v1/search/sku/:sku', () => {
    it('returns the product and matched variant on an exact SKU match', async () => {
      const sku = uniqueSku('EXACT');
      const product = await createProductViaApi({
        variants: [{ size: 'L', color: 'Green', sku, stock: 4 }],
      });

      const response = await request(app).get(`/api/v1/search/sku/${sku}`);

      expect(response.status).toBe(200);
      expect(response.body.data.product.id).toBe(product.body.data.id);
      expect(response.body.data.variant.sku).toBe(sku);
    });

    it('returns no result for a partial/substring SKU', async () => {
      const sku = uniqueSku('PARTIAL');
      await createProductViaApi({
        variants: [{ size: 'L', color: 'Green', sku, stock: 4 }],
      });

      const response = await request(app).get(`/api/v1/search/sku/${sku.slice(0, sku.length - 3)}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeNull();
    });

    it('returns no result for a nonexistent SKU', async () => {
      const response = await request(app).get(`/api/v1/search/sku/${uniqueSku('MISSING')}`);
      expect(response.status).toBe(200);
      expect(response.body.data).toBeNull();
    });

    it('excludes a match whose parent product is inactive', async () => {
      const sku = uniqueSku('INACTIVE');
      const product = await createProductViaApi({
        variants: [{ size: 'L', color: 'Green', sku, stock: 4 }],
      });
      await deactivateProduct(product.body.data.id);

      const response = await request(app).get(`/api/v1/search/sku/${sku}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeNull();
    });

    it('excludes a match whose parent product is soft-deleted', async () => {
      const sku = uniqueSku('DELETED');
      const product = await createProductViaApi({
        variants: [{ size: 'L', color: 'Green', sku, stock: 4 }],
      });
      await softDeleteProductViaApi(product.body.data.id);

      const response = await request(app).get(`/api/v1/search/sku/${sku}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeNull();
    });

    it('forwards an unexpected repository error to the error handler', async () => {
      const spy = vi
        .spyOn(discoveryRepository, 'findVariantBySku')
        .mockRejectedValueOnce(new Error('unexpected db failure'));

      try {
        const response = await request(app).get(`/api/v1/search/sku/${uniqueSku('BOOM')}`);
        expect(response.status).toBe(500);
      } finally {
        spy.mockRestore();
      }
    });
  });
});
