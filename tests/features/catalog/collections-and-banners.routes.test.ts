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
// (see products.routes.test.ts's identical helper).
function uniqueConflictError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.8.0',
    meta: {
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          originalCode: '23505',
          kind: 'UniqueConstraintViolation',
          constraint: { fields: ['slug'] },
        },
      },
    },
  });
}

function uniqueName(prefix = 'Collection'): string {
  return `${prefix} ${randomUUID()}`;
}

function staffToken(role: StaffRole = StaffRole.staff): string {
  return signAccessToken({
    sub: randomUUID(),
    type: 'staff',
    email: `${randomUUID()}@example.com`,
    role,
  });
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe('features/catalog collections & banners routes', () => {
  const app = createApp();
  const createdProductIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdCollectionIds: string[] = [];
  const createdBannerIds: string[] = [];

  afterAll(async () => {
    await prisma.collectionProduct.deleteMany({
      where: { collectionId: { in: createdCollectionIds } },
    });
    await prisma.collection.deleteMany({ where: { id: { in: createdCollectionIds } } });
    await prisma.banner.deleteMany({ where: { id: { in: createdBannerIds } } });
    await prisma.productVariant.deleteMany({ where: { productId: { in: createdProductIds } } });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.$disconnect();
  });

  async function createProduct(overrides: Record<string, unknown> = {}): Promise<string> {
    const response = await request(app)
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${staffToken()}`)
      .send({
        name: uniqueName('Product'),
        basePrice: '19.99',
        variants: [{ size: 'M', color: 'Black', sku: `SKU-${randomUUID()}`, stock: 10 }],
        ...overrides,
      });
    createdProductIds.push(response.body.data.id);
    return response.body.data.id as string;
  }

  async function createCategory(): Promise<string> {
    const response = await request(app)
      .post('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${staffToken()}`)
      .send({ name: uniqueName('Category') });
    createdCategoryIds.push(response.body.data.id);
    return response.body.data.id as string;
  }

  async function createCollectionViaApi(
    overrides: Record<string, unknown> = {},
  ): Promise<request.Response> {
    const response = await request(app)
      .post('/api/v1/admin/collections')
      .set('Authorization', `Bearer ${staffToken()}`)
      .send({ name: uniqueName(), ...overrides });
    if (response.status === 201) {
      createdCollectionIds.push(response.body.data.id);
    }
    return response;
  }

  async function createBannerViaApi(
    overrides: Record<string, unknown> = {},
  ): Promise<request.Response> {
    const response = await request(app)
      .post('/api/v1/admin/banners')
      .set('Authorization', `Bearer ${staffToken()}`)
      .send({
        title: uniqueName('Banner'),
        imageUrl: 'https://example.com/banner.png',
        linkType: 'url',
        linkValue: 'https://example.com',
        placement: 'homepage',
        ...overrides,
      });
    if (response.status === 201) {
      createdBannerIds.push(response.body.data.id);
    }
    return response;
  }

  describe('collection creation with initial product set', () => {
    it('creates a collection with an initial product set', async () => {
      const p1 = await createProduct();
      const p2 = await createProduct();
      const p3 = await createProduct();

      const response = await createCollectionViaApi({ productIds: [p1, p2, p3] });

      expect(response.status).toBe(201);

      const rows = await prisma.collectionProduct.findMany({
        where: { collectionId: response.body.data.id },
      });
      expect(rows).toHaveLength(3);
    });

    it('rejects creating a collection with a productId that does not exist', async () => {
      const response = await createCollectionViaApi({ productIds: [randomUUID()] });
      expect(response.status).toBe(404);
    });

    it('replaces the full product set via PUT .../products with no leftover rows', async () => {
      const p1 = await createProduct();
      const p2 = await createProduct();
      const p3 = await createProduct();
      const collection = await createCollectionViaApi({ productIds: [p1, p2, p3] });

      const p4 = await createProduct();
      const p5 = await createProduct();

      const response = await request(app)
        .put(`/api/v1/admin/collections/${collection.body.data.id}/products`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ productIds: [p4, p5] });

      expect(response.status).toBe(200);

      const rows = await prisma.collectionProduct.findMany({
        where: { collectionId: collection.body.data.id },
      });
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.productId).sort()).toEqual([p4, p5].sort());
    });

    it('clears a collection when productIds is an empty array', async () => {
      const p1 = await createProduct();
      const collection = await createCollectionViaApi({ productIds: [p1] });

      const response = await request(app)
        .put(`/api/v1/admin/collections/${collection.body.data.id}/products`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ productIds: [] });

      expect(response.status).toBe(200);

      const rows = await prisma.collectionProduct.findMany({
        where: { collectionId: collection.body.data.id },
      });
      expect(rows).toHaveLength(0);
    });

    it('rejects replacing products with an id that does not refer to an active product', async () => {
      const collection = await createCollectionViaApi();

      const response = await request(app)
        .put(`/api/v1/admin/collections/${collection.body.data.id}/products`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ productIds: [randomUUID()] });

      expect(response.status).toBe(404);
    });

    it('returns 404 replacing products on a nonexistent collection', async () => {
      const response = await request(app)
        .put(`/api/v1/admin/collections/${randomUUID()}/products`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ productIds: [] });

      expect(response.status).toBe(404);
    });
  });

  describe('collection date validation', () => {
    it('rejects a collection with endsAt before startsAt', async () => {
      const response = await createCollectionViaApi({
        startsAt: new Date(Date.now() + 60_000).toISOString(),
        endsAt: new Date(Date.now() - 60_000).toISOString(),
      });
      expect(response.status).toBe(422);
    });

    it('rejects setting a collection’s endsAt before the existing (unchanged) startsAt', async () => {
      const startsAt = new Date(Date.now() - ONE_DAY_MS).toISOString();
      const collection = await createCollectionViaApi({ startsAt });

      const response = await request(app)
        .patch(`/api/v1/admin/collections/${collection.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ endsAt: new Date(Date.now() - 2 * ONE_DAY_MS).toISOString() });

      expect(response.status).toBe(422);
    });

    it('rejects setting a collection’s startsAt after the existing (unchanged) endsAt', async () => {
      const endsAt = new Date(Date.now() + ONE_DAY_MS).toISOString();
      const collection = await createCollectionViaApi({ endsAt });

      const response = await request(app)
        .patch(`/api/v1/admin/collections/${collection.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ startsAt: new Date(Date.now() + 2 * ONE_DAY_MS).toISOString() });

      expect(response.status).toBe(422);
    });

    it('rejects endsAt before startsAt when both are provided in the same collection update', async () => {
      const collection = await createCollectionViaApi();

      const response = await request(app)
        .patch(`/api/v1/admin/collections/${collection.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({
          startsAt: new Date(Date.now() + ONE_DAY_MS).toISOString(),
          endsAt: new Date(Date.now() - ONE_DAY_MS).toISOString(),
        });

      expect(response.status).toBe(422);
    });
  });

  describe('access control', () => {
    it('read endpoints work unauthenticated', async () => {
      const listResponse = await request(app).get('/api/v1/collections');
      expect(listResponse.status).toBe(200);

      const homeResponse = await request(app).get('/api/v1/home');
      expect(homeResponse.status).toBe(200);
    });

    it('POST /api/v1/admin/collections without a staff session returns 401', async () => {
      const response = await request(app)
        .post('/api/v1/admin/collections')
        .send({ name: uniqueName() });
      expect(response.status).toBe(401);
    });

    it('DELETE /api/v1/admin/collections/:id with a staff-role session (below MANAGER) is rejected with 403', async () => {
      const collection = await createCollectionViaApi();
      const response = await request(app)
        .delete(`/api/v1/admin/collections/${collection.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken(StaffRole.staff)}`);
      expect(response.status).toBe(403);
    });

    it('DELETE /api/v1/admin/collections/:id with MANAGER succeeds', async () => {
      const collection = await createCollectionViaApi();
      const response = await request(app)
        .delete(`/api/v1/admin/collections/${collection.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken(StaffRole.manager)}`);
      expect(response.status).toBe(200);
    });

    it('POST /api/v1/admin/banners without a staff session returns 401', async () => {
      const response = await request(app).post('/api/v1/admin/banners').send({});
      expect(response.status).toBe(401);
    });

    it('DELETE /api/v1/admin/banners/:id with a staff-role session (below MANAGER) is rejected with 403', async () => {
      const banner = await createBannerViaApi();
      const response = await request(app)
        .delete(`/api/v1/admin/banners/${banner.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken(StaffRole.staff)}`);
      expect(response.status).toBe(403);
    });

    it('DELETE /api/v1/admin/banners/:id with MANAGER succeeds', async () => {
      const banner = await createBannerViaApi();
      const response = await request(app)
        .delete(`/api/v1/admin/banners/${banner.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken(StaffRole.manager)}`);
      expect(response.status).toBe(200);
    });
  });

  describe('banner linkType/linkValue validation', () => {
    it('accepts linkType url with any linkValue', async () => {
      const response = await createBannerViaApi({
        linkType: 'url',
        linkValue: 'https://example.com/x',
      });
      expect(response.status).toBe(201);
    });

    it('accepts linkType product with an existing product id', async () => {
      const productId = await createProduct();
      const response = await createBannerViaApi({ linkType: 'product', linkValue: productId });
      expect(response.status).toBe(201);
    });

    it('rejects linkType product with a nonexistent linkValue', async () => {
      const response = await createBannerViaApi({ linkType: 'product', linkValue: randomUUID() });
      expect(response.status).toBe(404);
    });

    it('accepts linkType category with an existing category id', async () => {
      const categoryId = await createCategory();
      const response = await createBannerViaApi({ linkType: 'category', linkValue: categoryId });
      expect(response.status).toBe(201);
    });

    it('rejects linkType category with a nonexistent linkValue', async () => {
      const response = await createBannerViaApi({ linkType: 'category', linkValue: randomUUID() });
      expect(response.status).toBe(404);
    });

    it('accepts linkType collection with an existing collection id', async () => {
      const collection = await createCollectionViaApi();
      const response = await createBannerViaApi({
        linkType: 'collection',
        linkValue: collection.body.data.id,
      });
      expect(response.status).toBe(201);
    });

    it('rejects linkType collection with a nonexistent linkValue', async () => {
      const response = await createBannerViaApi({
        linkType: 'collection',
        linkValue: randomUUID(),
      });
      expect(response.status).toBe(404);
    });

    it('rejects linkType url with a linkValue that is not a valid URL', async () => {
      const response = await createBannerViaApi({ linkType: 'url', linkValue: 'not-a-url' });
      expect(response.status).toBe(422);
    });
  });

  describe('banner date validation', () => {
    it('rejects a banner with endsAt before startsAt', async () => {
      const response = await createBannerViaApi({
        startsAt: new Date(Date.now() + 60_000).toISOString(),
        endsAt: new Date(Date.now() - 60_000).toISOString(),
      });
      expect(response.status).toBe(422);
    });
  });

  describe('active-window filtering — collections', () => {
    it('excludes a collection whose startsAt is in the future', async () => {
      const future = new Date(Date.now() + ONE_DAY_MS).toISOString();
      const collection = await createCollectionViaApi({ startsAt: future });

      const response = await request(app).get('/api/v1/collections');
      const ids = (response.body.data as { id: string }[]).map((c) => c.id);
      expect(ids).not.toContain(collection.body.data.id);
    });

    it('excludes a collection whose endsAt is in the past', async () => {
      const past = new Date(Date.now() - ONE_DAY_MS).toISOString();
      const collection = await createCollectionViaApi({ endsAt: past });

      const response = await request(app).get('/api/v1/collections');
      const ids = (response.body.data as { id: string }[]).map((c) => c.id);
      expect(ids).not.toContain(collection.body.data.id);
    });

    it('includes a collection with no dates set', async () => {
      const collection = await createCollectionViaApi();

      const response = await request(app).get('/api/v1/collections');
      const ids = (response.body.data as { id: string }[]).map((c) => c.id);
      expect(ids).toContain(collection.body.data.id);
    });

    it('includes a collection that is currently active (startsAt in past, endsAt in future)', async () => {
      const past = new Date(Date.now() - ONE_DAY_MS).toISOString();
      const future = new Date(Date.now() + ONE_DAY_MS).toISOString();
      const collection = await createCollectionViaApi({ startsAt: past, endsAt: future });

      const response = await request(app).get('/api/v1/collections');
      const ids = (response.body.data as { id: string }[]).map((c) => c.id);
      expect(ids).toContain(collection.body.data.id);
    });
  });

  describe('active-window filtering — banners (via /api/v1/home)', () => {
    async function homeBannerIds(): Promise<string[]> {
      const response = await request(app).get('/api/v1/home');
      const grouped = response.body.data.banners as Record<string, { id: string }[]>;
      return Object.values(grouped)
        .flat()
        .map((banner) => banner.id);
    }

    it('excludes a banner whose startsAt is in the future', async () => {
      const future = new Date(Date.now() + ONE_DAY_MS).toISOString();
      const banner = await createBannerViaApi({ startsAt: future });

      expect(await homeBannerIds()).not.toContain(banner.body.data.id);
    });

    it('excludes a banner whose endsAt is in the past', async () => {
      const past = new Date(Date.now() - ONE_DAY_MS).toISOString();
      const banner = await createBannerViaApi({ endsAt: past });

      expect(await homeBannerIds()).not.toContain(banner.body.data.id);
    });

    it('includes a banner with no dates set', async () => {
      const banner = await createBannerViaApi();

      expect(await homeBannerIds()).toContain(banner.body.data.id);
    });

    it('includes a banner that is currently active', async () => {
      const past = new Date(Date.now() - ONE_DAY_MS).toISOString();
      const future = new Date(Date.now() + ONE_DAY_MS).toISOString();
      const banner = await createBannerViaApi({ startsAt: past, endsAt: future });

      expect(await homeBannerIds()).toContain(banner.body.data.id);
    });
  });

  describe('getHomeSections shape', () => {
    it('groups active banners by placement and includes active collections with their products', async () => {
      const productId = await createProduct();
      const collection = await createCollectionViaApi({ productIds: [productId] });
      const homepageBanner = await createBannerViaApi({ placement: 'homepage' });
      const campaignBanner = await createBannerViaApi({ placement: 'campaign' });

      const response = await request(app).get('/api/v1/home');

      expect(response.status).toBe(200);
      const homepageIds = (response.body.data.banners.homepage as { id: string }[]).map(
        (b) => b.id,
      );
      const campaignIds = (response.body.data.banners.campaign as { id: string }[]).map(
        (b) => b.id,
      );
      expect(homepageIds).toContain(homepageBanner.body.data.id);
      expect(campaignIds).toContain(campaignBanner.body.data.id);

      const collectionEntry = (
        response.body.data.collections as { id: string; products: { id: string }[] }[]
      ).find((c) => c.id === collection.body.data.id);
      expect(collectionEntry).toBeDefined();
      expect(collectionEntry?.products.map((p) => p.id)).toContain(productId);
    });
  });

  describe('single collection detail view', () => {
    it('GET /api/v1/collections/:slug returns the collection with its products', async () => {
      const productId = await createProduct();
      const collection = await createCollectionViaApi({ productIds: [productId] });

      const response = await request(app).get(`/api/v1/collections/${collection.body.data.slug}`);

      expect(response.status).toBe(200);
      expect(response.body.data.products).toHaveLength(1);
      expect(response.body.data.products[0].id).toBe(productId);
    });

    it('returns 404 for a nonexistent collection slug', async () => {
      const response = await request(app).get('/api/v1/collections/does-not-exist-slug');
      expect(response.status).toBe(404);
    });
  });

  describe('collection product listings exclude inactive/soft-deleted products', () => {
    it('excludes a product that was soft-deleted after being added to a collection, from both the detail view and the home sections', async () => {
      const productId = await createProduct();
      const collection = await createCollectionViaApi({ productIds: [productId] });

      await request(app)
        .delete(`/api/v1/admin/products/${productId}`)
        .set('Authorization', `Bearer ${staffToken(StaffRole.manager)}`);

      const detailResponse = await request(app).get(
        `/api/v1/collections/${collection.body.data.slug}`,
      );
      expect(detailResponse.status).toBe(200);
      expect(detailResponse.body.data.products).toHaveLength(0);

      const homeResponse = await request(app).get('/api/v1/home');
      const collectionEntry = (
        homeResponse.body.data.collections as { id: string; products: { id: string }[] }[]
      ).find((c) => c.id === collection.body.data.id);
      expect(collectionEntry?.products).toHaveLength(0);
    });

    it('excludes a product that was deactivated (isActive: false, not soft-deleted) after being added to a collection', async () => {
      const productId = await createProduct();
      const collection = await createCollectionViaApi({ productIds: [productId] });

      await prisma.product.update({ where: { id: productId }, data: { isActive: false } });

      const detailResponse = await request(app).get(
        `/api/v1/collections/${collection.body.data.slug}`,
      );
      expect(detailResponse.status).toBe(200);
      expect(detailResponse.body.data.products).toHaveLength(0);

      const homeResponse = await request(app).get('/api/v1/home');
      const collectionEntry = (
        homeResponse.body.data.collections as { id: string; products: { id: string }[] }[]
      ).find((c) => c.id === collection.body.data.id);
      expect(collectionEntry?.products).toHaveLength(0);
    });
  });

  describe('collection update', () => {
    it('updates a collection name/description/isActive', async () => {
      const collection = await createCollectionViaApi();

      const response = await request(app)
        .patch(`/api/v1/admin/collections/${collection.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ name: 'Updated Name', description: 'Updated description', isActive: false });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe('Updated Name');
      expect(response.body.data.description).toBe('Updated description');
      expect(response.body.data.isActive).toBe(false);
    });

    it('rejects an explicit duplicate slug on update with a clean ConflictError', async () => {
      const slug = `dup-collection-slug-${randomUUID()}`;
      const first = await createCollectionViaApi({ slug });
      expect(first.status).toBe(201);
      const second = await createCollectionViaApi();

      const response = await request(app)
        .patch(`/api/v1/admin/collections/${second.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ slug });

      expect(response.status).toBe(409);
    });

    it('updates slug, startsAt, and endsAt', async () => {
      const collection = await createCollectionViaApi();
      const newSlug = `updated-collection-slug-${randomUUID()}`;
      const startsAt = new Date(Date.now() - ONE_DAY_MS).toISOString();
      const endsAt = new Date(Date.now() + ONE_DAY_MS).toISOString();

      const response = await request(app)
        .patch(`/api/v1/admin/collections/${collection.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ slug: newSlug, startsAt, endsAt });

      expect(response.status).toBe(200);
      expect(response.body.data.slug).toBe(newSlug);
      expect(new Date(response.body.data.startsAt).toISOString()).toBe(startsAt);
      expect(new Date(response.body.data.endsAt).toISOString()).toBe(endsAt);
    });

    it('returns 404 updating a nonexistent collection', async () => {
      const response = await request(app)
        .patch(`/api/v1/admin/collections/${randomUUID()}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ name: 'x' });
      expect(response.status).toBe(404);
    });

    it('returns 404 deleting a nonexistent collection', async () => {
      const response = await request(app)
        .delete(`/api/v1/admin/collections/${randomUUID()}`)
        .set('Authorization', `Bearer ${staffToken(StaffRole.manager)}`);
      expect(response.status).toBe(404);
    });
  });

  describe('banner update', () => {
    it('updates banner fields', async () => {
      const banner = await createBannerViaApi();

      const response = await request(app)
        .patch(`/api/v1/admin/banners/${banner.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ title: 'Updated Title', sortOrder: 5, isActive: false });

      expect(response.status).toBe(200);
      expect(response.body.data.title).toBe('Updated Title');
      expect(response.body.data.sortOrder).toBe(5);
      expect(response.body.data.isActive).toBe(false);
    });

    it('updates imageUrl, linkType/linkValue, placement, startsAt, and endsAt', async () => {
      const banner = await createBannerViaApi();
      const categoryId = await createCategory();
      const startsAt = new Date(Date.now() - ONE_DAY_MS).toISOString();
      const endsAt = new Date(Date.now() + ONE_DAY_MS).toISOString();

      const response = await request(app)
        .patch(`/api/v1/admin/banners/${banner.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({
          imageUrl: 'https://example.com/updated.png',
          linkType: 'category',
          linkValue: categoryId,
          placement: 'campaign',
          startsAt,
          endsAt,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.imageUrl).toBe('https://example.com/updated.png');
      expect(response.body.data.linkType).toBe('category');
      expect(response.body.data.linkValue).toBe(categoryId);
      expect(response.body.data.placement).toBe('campaign');
      expect(new Date(response.body.data.startsAt).toISOString()).toBe(startsAt);
      expect(new Date(response.body.data.endsAt).toISOString()).toBe(endsAt);
    });

    it('returns 404 updating a nonexistent banner', async () => {
      const response = await request(app)
        .patch(`/api/v1/admin/banners/${randomUUID()}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ title: 'x' });
      expect(response.status).toBe(404);
    });

    it('rejects updating linkType/linkValue to a nonexistent product', async () => {
      const banner = await createBannerViaApi();

      const response = await request(app)
        .patch(`/api/v1/admin/banners/${banner.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ linkType: 'product', linkValue: randomUUID() });

      expect(response.status).toBe(404);
    });

    it('rejects updating linkValue to a non-URL string when the banner’s linkType is (or is being set to) url', async () => {
      const banner = await createBannerViaApi({
        linkType: 'url',
        linkValue: 'https://example.com',
      });

      const response = await request(app)
        .patch(`/api/v1/admin/banners/${banner.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ linkValue: 'not-a-url' });

      expect(response.status).toBe(422);
    });

    it('rejects setting endsAt before the existing (unchanged) startsAt', async () => {
      const startsAt = new Date(Date.now() - ONE_DAY_MS).toISOString();
      const banner = await createBannerViaApi({ startsAt });

      const response = await request(app)
        .patch(`/api/v1/admin/banners/${banner.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ endsAt: new Date(Date.now() - 2 * ONE_DAY_MS).toISOString() });

      expect(response.status).toBe(422);
    });

    it('rejects setting startsAt after the existing (unchanged) endsAt', async () => {
      const endsAt = new Date(Date.now() + ONE_DAY_MS).toISOString();
      const banner = await createBannerViaApi({ endsAt });

      const response = await request(app)
        .patch(`/api/v1/admin/banners/${banner.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ startsAt: new Date(Date.now() + 2 * ONE_DAY_MS).toISOString() });

      expect(response.status).toBe(422);
    });

    it('rejects endsAt before startsAt when both are provided in the same update', async () => {
      const banner = await createBannerViaApi();

      const response = await request(app)
        .patch(`/api/v1/admin/banners/${banner.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({
          startsAt: new Date(Date.now() + ONE_DAY_MS).toISOString(),
          endsAt: new Date(Date.now() - ONE_DAY_MS).toISOString(),
        });

      expect(response.status).toBe(422);
    });

    it('allows updating linkValue when the stored linkType is an unrecognized value (forward-compat, e.g. legacy data)', async () => {
      const banner = await createBannerViaApi();
      await prisma.banner.update({
        where: { id: banner.body.data.id },
        data: { linkType: 'legacy-unknown-type' },
      });

      const response = await request(app)
        .patch(`/api/v1/admin/banners/${banner.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ linkValue: 'anything-goes' });

      expect(response.status).toBe(200);
      expect(response.body.data.linkValue).toBe('anything-goes');
    });

    it('returns 404 deleting a nonexistent banner', async () => {
      const response = await request(app)
        .delete(`/api/v1/admin/banners/${randomUUID()}`)
        .set('Authorization', `Bearer ${staffToken(StaffRole.manager)}`);
      expect(response.status).toBe(404);
    });
  });

  describe('repository', () => {
    it('listActiveBanners filters by placement when provided', async () => {
      const homepage = await createBannerViaApi({ placement: 'homepage' });
      const campaign = await createBannerViaApi({ placement: 'campaign' });

      const homepageOnly = await catalogRepository.listActiveBanners('homepage');
      const ids = homepageOnly.map((banner) => banner.id);

      expect(ids).toContain(homepage.body.data.id);
      expect(ids).not.toContain(campaign.body.data.id);
    });
  });

  describe('slug handling', () => {
    it('auto-generates a slug from name and appends a suffix on collision', async () => {
      const name = `Collision Collection ${randomUUID()}`;
      const first = await createCollectionViaApi({ name });
      const second = await createCollectionViaApi({ name });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.data.slug).not.toBe(first.body.data.slug);
      expect(second.body.data.slug.startsWith(first.body.data.slug)).toBe(true);
    });

    it('rejects with a ConflictError when no unique slug can be generated', async () => {
      const spy = vi
        .spyOn(catalogRepository, 'findCollectionBySlug')
        .mockResolvedValue({ id: randomUUID() } as never);

      const response = await createCollectionViaApi({
        name: uniqueName('AlwaysCollidesCollection'),
      });

      expect(response.status).toBe(409);
      spy.mockRestore();
    });
  });

  describe('race guard (TOCTOU between pre-check and write)', () => {
    it('maps a concurrent unique-constraint violation on create to a clean 409', async () => {
      const spy = vi
        .spyOn(catalogRepository, 'createCollection')
        .mockRejectedValueOnce(uniqueConflictError());

      const response = await createCollectionViaApi();

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
      spy.mockRestore();
    });

    it('rethrows a non-P2002 error from create instead of swallowing it', async () => {
      const spy = vi
        .spyOn(catalogRepository, 'createCollection')
        .mockRejectedValueOnce(new Error('unexpected db failure'));

      const response = await createCollectionViaApi();

      expect(response.status).toBe(500);
      spy.mockRestore();
    });

    it('maps a concurrent unique-constraint violation on update to a clean 409', async () => {
      const collection = await createCollectionViaApi();
      const spy = vi
        .spyOn(catalogRepository, 'updateCollection')
        .mockRejectedValueOnce(uniqueConflictError());

      const response = await request(app)
        .patch(`/api/v1/admin/collections/${collection.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ name: 'Whatever' });

      expect(response.status).toBe(409);
      spy.mockRestore();
    });
  });

  describe('controller error forwarding', () => {
    it('forwards a service error from GET /api/v1/home to the error handler', async () => {
      const spy = vi
        .spyOn(catalogRepository, 'listActiveBanners')
        .mockRejectedValueOnce(new Error('boom'));

      const response = await request(app).get('/api/v1/home');

      expect(response.status).toBe(500);
      spy.mockRestore();
    });

    it('forwards a service error from GET /api/v1/collections to the error handler', async () => {
      const spy = vi
        .spyOn(catalogRepository, 'listActiveCollections')
        .mockRejectedValueOnce(new Error('boom'));

      const response = await request(app).get('/api/v1/collections');

      expect(response.status).toBe(500);
      spy.mockRestore();
    });
  });
});
