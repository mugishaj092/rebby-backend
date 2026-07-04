import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { createApp } from '@/app';
import { signAccessToken } from '@/core/security/jwt';
import { prisma } from '@/db/prisma';
import { variantsRepository } from '@/features/variants/repository';
import { Prisma } from '@/generated/prisma/client';
import { StaffRole } from '@/generated/prisma/enums';

// Mirrors the real shape a P2002 takes with this project's @prisma/adapter-pg driver adapter
// (see products.routes.test.ts's identical helper).
function uniqueConflictError(fields: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.8.0',
    meta: {
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: { originalCode: '23505', kind: 'UniqueConstraintViolation', constraint: { fields } },
      },
    },
  });
}

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

function baseVariant(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    size: 'M',
    color: 'Black',
    sku: uniqueSku(),
    stock: 10,
    ...overrides,
  };
}

describe('features/variants routes', () => {
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
        variants: [baseVariant()],
        ...overrides,
      });

    if (response.status === 201) {
      createdProductIds.push(response.body.data.id);
    }
    return response;
  }

  describe('access control', () => {
    it('DELETE /api/v1/admin/variants/:id with a staff-role session (below MANAGER) is rejected with 403', async () => {
      const created = await createProductViaApi();
      const variantId = created.body.data.variants[0].id;
      const response = await request(app)
        .delete(`/api/v1/admin/variants/${variantId}`)
        .set('Authorization', `Bearer ${staffToken(StaffRole.staff)}`);
      expect(response.status).toBe(403);
    });
  });

  describe('SKU uniqueness', () => {
    it('rejects adding a variant whose SKU already exists elsewhere', async () => {
      const existingSku = uniqueSku();
      const owner = await createProductViaApi({ variants: [baseVariant({ sku: existingSku })] });
      const other = await createProductViaApi();
      void owner;

      const response = await request(app)
        .post(`/api/v1/admin/products/${other.body.data.id}/variants`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send(baseVariant({ sku: existingSku, size: 'XL' }));

      expect(response.status).toBe(409);
    });

    it('rejects updating a variant to a SKU that already exists on another variant', async () => {
      const existingSku = uniqueSku();
      await createProductViaApi({ variants: [baseVariant({ sku: existingSku })] });
      const other = await createProductViaApi();
      const otherVariantId = other.body.data.variants[0].id;

      const response = await request(app)
        .patch(`/api/v1/admin/variants/${otherVariantId}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ sku: existingSku });

      expect(response.status).toBe(409);
    });
  });

  describe('add variant to an existing product', () => {
    it('adds a new variant to an existing product', async () => {
      const product = await createProductViaApi({ variants: [baseVariant({ size: 'S' })] });

      const response = await request(app)
        .post(`/api/v1/admin/products/${product.body.data.id}/variants`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send(baseVariant({ size: 'M' }));

      expect(response.status).toBe(201);
      expect(response.body.data.productId).toBe(product.body.data.id);
    });

    it('returns 404 adding a variant to a nonexistent product', async () => {
      const response = await request(app)
        .post(`/api/v1/admin/products/${randomUUID()}/variants`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send(baseVariant());

      expect(response.status).toBe(404);
    });

    it('accepts a priceOverride on the new variant', async () => {
      const product = await createProductViaApi({ variants: [baseVariant({ size: 'S' })] });

      const response = await request(app)
        .post(`/api/v1/admin/products/${product.body.data.id}/variants`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send(baseVariant({ size: 'M', priceOverride: '15.00' }));

      expect(response.status).toBe(201);
      expect(response.body.data.priceOverride).toBe('15');
    });
  });

  describe('productId + size + color uniqueness', () => {
    it('rejects adding a variant with the same size/color combo twice for one product', async () => {
      const product = await createProductViaApi({
        variants: [baseVariant({ size: 'M', color: 'Red' })],
      });

      const response = await request(app)
        .post(`/api/v1/admin/products/${product.body.data.id}/variants`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send(baseVariant({ size: 'M', color: 'Red' }));

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
    });
  });

  describe('updateVariant — administrative stock correction', () => {
    it('allows a staff member to directly adjust stock', async () => {
      const product = await createProductViaApi({ variants: [baseVariant({ stock: 5 })] });
      const variantId = product.body.data.variants[0].id;

      const response = await request(app)
        .patch(`/api/v1/admin/variants/${variantId}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ stock: 42 });

      expect(response.status).toBe(200);
      expect(response.body.data.stock).toBe(42);
    });

    it('returns 404 updating a nonexistent variant', async () => {
      const response = await request(app)
        .patch(`/api/v1/admin/variants/${randomUUID()}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ stock: 1 });
      expect(response.status).toBe(404);
    });

    it('updates size, color, sku, and priceOverride together', async () => {
      const product = await createProductViaApi({ variants: [baseVariant({ size: 'S' })] });
      const variantId = product.body.data.variants[0].id;
      const newSku = uniqueSku('UPDATED');

      const response = await request(app)
        .patch(`/api/v1/admin/variants/${variantId}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ size: 'XL', color: 'Green', sku: newSku, priceOverride: '12.00' });

      expect(response.status).toBe(200);
      expect(response.body.data.size).toBe('XL');
      expect(response.body.data.color).toBe('Green');
      expect(response.body.data.sku).toBe(newSku);
      expect(response.body.data.priceOverride).toBe('12');
    });

    it('returns 404 deleting a nonexistent variant', async () => {
      const response = await request(app)
        .delete(`/api/v1/admin/variants/${randomUUID()}`)
        .set('Authorization', `Bearer ${staffToken(StaffRole.manager)}`);
      expect(response.status).toBe(404);
    });

    it('DELETE /api/v1/admin/variants/:id with a MANAGER session removes the variant', async () => {
      const product = await createProductViaApi({
        variants: [baseVariant({ size: 'S' }), baseVariant({ size: 'M' })],
      });
      const variantId = product.body.data.variants[0].id;

      const response = await request(app)
        .delete(`/api/v1/admin/variants/${variantId}`)
        .set('Authorization', `Bearer ${staffToken(StaffRole.manager)}`);

      expect(response.status).toBe(200);

      const row = await prisma.productVariant.findUnique({ where: { id: variantId } });
      expect(row).toBeNull();
    });
  });

  describe('race guard (TOCTOU between pre-check and write)', () => {
    it('maps a concurrent unique-constraint violation on addVariant (sku) to a clean 409', async () => {
      const product = await createProductViaApi();
      const spy = vi
        .spyOn(variantsRepository, 'addVariant')
        .mockRejectedValueOnce(uniqueConflictError(['sku']));

      const response = await request(app)
        .post(`/api/v1/admin/products/${product.body.data.id}/variants`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send(baseVariant({ size: 'Z' }));

      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/sku/i);
      spy.mockRestore();
    });

    it('maps a concurrent unique-constraint violation on addVariant (size+color) to a clean 409', async () => {
      const product = await createProductViaApi();
      const spy = vi
        .spyOn(variantsRepository, 'addVariant')
        .mockRejectedValueOnce(uniqueConflictError(['product_id', 'size', 'color']));

      const response = await request(app)
        .post(`/api/v1/admin/products/${product.body.data.id}/variants`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send(baseVariant({ size: 'Z' }));

      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/size and color/i);
      spy.mockRestore();
    });

    it('maps an unrecognized unique-constraint target on addVariant to a generic clean 409', async () => {
      const product = await createProductViaApi();
      const spy = vi
        .spyOn(variantsRepository, 'addVariant')
        .mockRejectedValueOnce(uniqueConflictError(['something_else']));

      const response = await request(app)
        .post(`/api/v1/admin/products/${product.body.data.id}/variants`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send(baseVariant({ size: 'Z' }));

      expect(response.status).toBe(409);
      expect(response.body.error.message).toBe('A conflicting record already exists');
      spy.mockRestore();
    });

    it('rethrows a non-P2002 error from addVariant instead of swallowing it', async () => {
      const product = await createProductViaApi();
      const spy = vi
        .spyOn(variantsRepository, 'addVariant')
        .mockRejectedValueOnce(new Error('unexpected db failure'));

      const response = await request(app)
        .post(`/api/v1/admin/products/${product.body.data.id}/variants`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send(baseVariant({ size: 'Z' }));

      expect(response.status).toBe(500);
      spy.mockRestore();
    });

    it('maps a concurrent unique-constraint violation on updateVariant to a clean 409', async () => {
      const product = await createProductViaApi();
      const variantId = product.body.data.variants[0].id;
      const spy = vi
        .spyOn(variantsRepository, 'updateVariant')
        .mockRejectedValueOnce(uniqueConflictError(['sku']));

      const response = await request(app)
        .patch(`/api/v1/admin/variants/${variantId}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ stock: 3 });

      expect(response.status).toBe(409);
      spy.mockRestore();
    });
  });
});
