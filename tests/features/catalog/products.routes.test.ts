import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { createApp } from '@/app';
import { signAccessToken } from '@/core/security/jwt';
import { prisma } from '@/db/prisma';
import { catalogRepository } from '@/features/catalog/repository';
import { Prisma } from '@/generated/prisma/client';
import { StaffRole } from '@/generated/prisma/enums';

// Mirrors the real shape a P2002 takes with this project's @prisma/adapter-pg driver adapter
// (verified against an actual Postgres unique-constraint violation) — the classic `meta.target`
// is not populated; the violated columns live under `meta.driverAdapterError.cause.constraint`.
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

describe('features/catalog products & variants routes', () => {
  const app = createApp();
  const createdProductIds: string[] = [];
  const createdCategoryIds: string[] = [];

  afterAll(async () => {
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

  async function createProductViaApi(
    overrides: Record<string, unknown> = {},
    role: StaffRole = StaffRole.staff,
  ): Promise<request.Response> {
    const response = await request(app)
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${staffToken(role)}`)
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

  describe('nested create', () => {
    it('creates a product with 3 variants and 2 images in one call, all present on read-back', async () => {
      const response = await createProductViaApi({
        variants: [
          baseVariant({ size: 'S', color: 'Black' }),
          baseVariant({ size: 'M', color: 'Black' }),
          baseVariant({ size: 'L', color: 'Black' }),
        ],
        images: [
          { url: 'https://example.com/1.png', isPrimary: true },
          { url: 'https://example.com/2.png', sortOrder: 1 },
        ],
      });

      expect(response.status).toBe(201);
      expect(response.body.data.variants).toHaveLength(3);
      expect(response.body.data.images).toHaveLength(2);

      const persisted = await prisma.product.findUnique({
        where: { id: response.body.data.id },
        include: { variants: true, images: true },
      });
      expect(persisted?.variants).toHaveLength(3);
      expect(persisted?.images).toHaveLength(2);
    });

    it('defaults images to [] and applies image/variant field defaults', async () => {
      const response = await createProductViaApi({
        variants: [{ size: 'M', color: 'Blue', sku: uniqueSku(), stock: 3 }],
      });

      expect(response.status).toBe(201);
      expect(response.body.data.images).toEqual([]);
      expect(response.body.data.variants[0].priceOverride).toBeNull();
    });

    it('accepts compareAtPrice and a per-variant priceOverride', async () => {
      const response = await createProductViaApi({
        compareAtPrice: '29.99',
        variants: [baseVariant({ priceOverride: '17.50' })],
      });

      expect(response.status).toBe(201);
      expect(response.body.data.compareAtPrice).toBe('29.99');
      expect(response.body.data.variants[0].priceOverride).toBe('17.5');
    });
  });

  describe('access control', () => {
    it('POST /api/v1/admin/products without a staff session returns 401', async () => {
      const response = await request(app)
        .post('/api/v1/admin/products')
        .send({ name: uniqueName(), basePrice: '10.00', variants: [baseVariant()] });
      expect(response.status).toBe(401);
    });

    it('POST /api/v1/admin/products with a valid staff session succeeds', async () => {
      const response = await createProductViaApi();
      expect(response.status).toBe(201);
    });

    it('DELETE /api/v1/admin/products/:id with a staff-role session (below MANAGER) is rejected with 403', async () => {
      const created = await createProductViaApi();
      const response = await request(app)
        .delete(`/api/v1/admin/products/${created.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken(StaffRole.staff)}`);
      expect(response.status).toBe(403);
    });

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
    it('rejects two variants with the same SKU in one request, before any DB write', async () => {
      const sku = uniqueSku();
      const response = await createProductViaApi({
        variants: [baseVariant({ sku, size: 'S' }), baseVariant({ sku, size: 'M' })],
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');

      const existing = await prisma.productVariant.findUnique({ where: { sku } });
      expect(existing).toBeNull();
    });

    it('rejects a SKU that already exists on another product with a clean ConflictError', async () => {
      const existingSku = uniqueSku();
      const first = await createProductViaApi({ variants: [baseVariant({ sku: existingSku })] });
      expect(first.status).toBe(201);

      const response = await createProductViaApi({ variants: [baseVariant({ sku: existingSku })] });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
    });

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

  describe('soft delete', () => {
    it('sets deletedAt and isActive false but keeps the row queryable by id', async () => {
      const product = await createProductViaApi();

      const response = await request(app)
        .delete(`/api/v1/admin/products/${product.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken(StaffRole.manager)}`);

      expect(response.status).toBe(200);

      const row = await prisma.product.findUnique({ where: { id: product.body.data.id } });
      expect(row).not.toBeNull();
      expect(row?.deletedAt).not.toBeNull();
      expect(row?.isActive).toBe(false);
    });

    it('returns 404 when deleting a product that does not exist', async () => {
      const response = await request(app)
        .delete(`/api/v1/admin/products/${randomUUID()}`)
        .set('Authorization', `Bearer ${staffToken(StaffRole.manager)}`);
      expect(response.status).toBe(404);
    });
  });

  describe('category deletion blocked by active products', () => {
    it('rejects deleting a category that still has active products', async () => {
      const categoryId = await createCategoryViaApi();
      await createProductViaApi({ categoryId });

      const response = await request(app)
        .delete(`/api/v1/admin/categories/${categoryId}`)
        .set('Authorization', `Bearer ${staffToken(StaffRole.manager)}`);

      expect(response.status).toBe(409);
    });

    it('allows deleting a category once its only product has been soft-deleted', async () => {
      const categoryId = await createCategoryViaApi();
      const product = await createProductViaApi({ categoryId });

      await request(app)
        .delete(`/api/v1/admin/products/${product.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken(StaffRole.manager)}`);

      const response = await request(app)
        .delete(`/api/v1/admin/categories/${categoryId}`)
        .set('Authorization', `Bearer ${staffToken(StaffRole.manager)}`);

      expect(response.status).toBe(200);
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

  describe('update product', () => {
    it('updates product-level fields only', async () => {
      const product = await createProductViaApi();

      const response = await request(app)
        .patch(`/api/v1/admin/products/${product.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ name: 'Updated Name', basePrice: '25.50' });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe('Updated Name');
      // Prisma.Decimal's toString() normalizes trailing zeros (decimal.js behavior) —
      // the DB column still stores/enforces the full Decimal(12,2) precision.
      expect(response.body.data.basePrice).toBe('25.5');
    });

    it('updates description, fabric, careInstructions, slug, categoryId, and compareAtPrice', async () => {
      const product = await createProductViaApi();
      const categoryId = await createCategoryViaApi();
      const newSlug = `updated-product-slug-${randomUUID()}`;

      const response = await request(app)
        .patch(`/api/v1/admin/products/${product.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({
          description: 'A soft cotton t-shirt',
          fabric: 'Cotton',
          careInstructions: 'Machine wash cold',
          slug: newSlug,
          categoryId,
          compareAtPrice: '39.99',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.description).toBe('A soft cotton t-shirt');
      expect(response.body.data.fabric).toBe('Cotton');
      expect(response.body.data.careInstructions).toBe('Machine wash cold');
      expect(response.body.data.slug).toBe(newSlug);
      expect(response.body.data.categoryId).toBe(categoryId);
      expect(response.body.data.compareAtPrice).toBe('39.99');
    });

    it('rejects an unknown categoryId on update', async () => {
      const product = await createProductViaApi();
      const response = await request(app)
        .patch(`/api/v1/admin/products/${product.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ categoryId: randomUUID() });
      expect(response.status).toBe(404);
    });

    it('returns 404 updating a nonexistent product', async () => {
      const response = await request(app)
        .patch(`/api/v1/admin/products/${randomUUID()}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ name: 'Does Not Matter' });
      expect(response.status).toBe(404);
    });

    it('rejects an explicit duplicate slug on update with a clean ConflictError', async () => {
      const slug = `dup-product-slug-${randomUUID()}`;
      const first = await createProductViaApi({ slug });
      expect(first.status).toBe(201);
      const second = await createProductViaApi();

      const response = await request(app)
        .patch(`/api/v1/admin/products/${second.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ slug });

      expect(response.status).toBe(409);
    });
  });

  describe('category validation on create', () => {
    it('rejects creating a product under a categoryId that does not exist', async () => {
      const response = await createProductViaApi({ categoryId: randomUUID() });
      expect(response.status).toBe(404);
    });

    it('accepts a valid categoryId', async () => {
      const categoryId = await createCategoryViaApi();
      const response = await createProductViaApi({ categoryId });
      expect(response.status).toBe(201);
      expect(response.body.data.categoryId).toBe(categoryId);
    });
  });

  describe('slug handling', () => {
    it('auto-generates a slug from name and appends a suffix on collision', async () => {
      const name = `Collision Product ${randomUUID()}`;
      const first = await createProductViaApi({ name });
      const second = await createProductViaApi({ name });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.data.slug).not.toBe(first.body.data.slug);
      expect(second.body.data.slug.startsWith(first.body.data.slug)).toBe(true);
    });

    it('rejects an explicit duplicate slug on create with a clean ConflictError', async () => {
      const slug = `explicit-product-slug-${randomUUID()}`;
      const first = await createProductViaApi({ slug });
      expect(first.status).toBe(201);

      const response = await createProductViaApi({ slug });

      expect(response.status).toBe(409);
    });

    it('rejects with a ConflictError when no unique slug can be generated', async () => {
      const spy = vi
        .spyOn(catalogRepository, 'findProductBySlug')
        .mockResolvedValue({ id: randomUUID() } as never);

      const response = await createProductViaApi({ name: uniqueName('AlwaysCollidesProduct') });

      expect(response.status).toBe(409);
      spy.mockRestore();
    });
  });

  describe('validation', () => {
    it('rejects creating a product with zero variants', async () => {
      const response = await createProductViaApi({ variants: [] });
      expect(response.status).toBe(422);
    });

    it('rejects a non-decimal basePrice', async () => {
      const response = await createProductViaApi({ basePrice: 'abc' });
      expect(response.status).toBe(422);
    });

    it('rejects a zero basePrice', async () => {
      const response = await createProductViaApi({ basePrice: '0' });
      expect(response.status).toBe(422);
    });
  });

  describe('repository', () => {
    it('findProductById excludes soft-deleted rows by default but includes them with includeDeleted', async () => {
      const product = await createProductViaApi();
      await request(app)
        .delete(`/api/v1/admin/products/${product.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken(StaffRole.manager)}`);

      const excluded = await catalogRepository.findProductById(product.body.data.id);
      expect(excluded).toBeNull();

      const included = await catalogRepository.findProductById(product.body.data.id, {
        includeDeleted: true,
      });
      expect(included?.id).toBe(product.body.data.id);
    });
  });

  describe('race guard (TOCTOU between pre-check and write)', () => {
    it('maps a concurrent unique-constraint violation on create (slug) to a clean 409 with a slug-specific message', async () => {
      const spy = vi
        .spyOn(catalogRepository, 'createProductWithVariants')
        .mockRejectedValueOnce(uniqueConflictError(['slug']));

      const response = await createProductViaApi();

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
      expect(response.body.error.message).toMatch(/slug/i);
      spy.mockRestore();
    });

    it('also maps the classic meta.target shape (forward-compat) to the same slug-specific message', async () => {
      const spy = vi
        .spyOn(catalogRepository, 'createProductWithVariants')
        .mockRejectedValueOnce(
          new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: '7.8.0',
            meta: { target: ['slug'] },
          }),
        );

      const response = await createProductViaApi();

      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/slug/i);
      spy.mockRestore();
    });

    it('maps a concurrent unique-constraint violation on create (sku) to a clean 409', async () => {
      const spy = vi
        .spyOn(catalogRepository, 'createProductWithVariants')
        .mockRejectedValueOnce(uniqueConflictError(['sku']));

      const response = await createProductViaApi();

      expect(response.status).toBe(409);
      spy.mockRestore();
    });

    it('maps a concurrent unique-constraint violation on create (size+color) to a clean 409', async () => {
      const spy = vi
        .spyOn(catalogRepository, 'createProductWithVariants')
        .mockRejectedValueOnce(uniqueConflictError(['product_id', 'size', 'color']));

      const response = await createProductViaApi();

      expect(response.status).toBe(409);
      spy.mockRestore();
    });

    it('maps an unrecognized unique-constraint target to a generic clean 409', async () => {
      const spy = vi
        .spyOn(catalogRepository, 'createProductWithVariants')
        .mockRejectedValueOnce(uniqueConflictError(['something_else']));

      const response = await createProductViaApi();

      expect(response.status).toBe(409);
      spy.mockRestore();
    });

    it('maps a P2002 with no recognizable meta shape at all to a generic clean 409', async () => {
      const spy = vi.spyOn(catalogRepository, 'createProductWithVariants').mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '7.8.0',
        }),
      );

      const response = await createProductViaApi();

      expect(response.status).toBe(409);
      expect(response.body.error.message).toBe('A conflicting record already exists');
      spy.mockRestore();
    });

    it('rethrows a non-P2002 error from create instead of swallowing it', async () => {
      const spy = vi
        .spyOn(catalogRepository, 'createProductWithVariants')
        .mockRejectedValueOnce(new Error('unexpected db failure'));

      const response = await createProductViaApi();

      expect(response.status).toBe(500);
      spy.mockRestore();
    });
  });
});
