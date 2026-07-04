import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { createApp } from '@/app';
import { signAccessToken } from '@/core/security/jwt';
import { prisma } from '@/db/prisma';
import { bannersRepository } from '@/features/banners/repository';
import { StaffRole } from '@/generated/prisma/enums';

function uniqueName(prefix = 'Banner'): string {
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

describe('features/banners routes', () => {
  const app = createApp();
  const createdProductIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdCollectionIds: string[] = [];
  const createdBannerIds: string[] = [];

  afterAll(async () => {
    await prisma.banner.deleteMany({ where: { id: { in: createdBannerIds } } });
    await prisma.collectionProduct.deleteMany({
      where: { collectionId: { in: createdCollectionIds } },
    });
    await prisma.collection.deleteMany({ where: { id: { in: createdCollectionIds } } });
    await prisma.productVariant.deleteMany({ where: { productId: { in: createdProductIds } } });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.$disconnect();
  });

  async function createProduct(): Promise<string> {
    const response = await request(app)
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${staffToken()}`)
      .send({
        name: uniqueName('Product'),
        basePrice: '19.99',
        variants: [{ size: 'M', color: 'Black', sku: `SKU-${randomUUID()}`, stock: 10 }],
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

  async function createCollection(): Promise<string> {
    const response = await request(app)
      .post('/api/v1/admin/collections')
      .set('Authorization', `Bearer ${staffToken()}`)
      .send({ name: uniqueName('Collection') });
    createdCollectionIds.push(response.body.data.id);
    return response.body.data.id as string;
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

  describe('access control', () => {
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

  describe('linkType/linkValue validation', () => {
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
      const collectionId = await createCollection();
      const response = await createBannerViaApi({
        linkType: 'collection',
        linkValue: collectionId,
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

  describe('date validation', () => {
    it('rejects a banner with endsAt before startsAt', async () => {
      const response = await createBannerViaApi({
        startsAt: new Date(Date.now() + 60_000).toISOString(),
        endsAt: new Date(Date.now() - 60_000).toISOString(),
      });
      expect(response.status).toBe(422);
    });
  });

  describe('active-window filtering (via /api/v1/home)', () => {
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

  describe('update', () => {
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

      const homepageOnly = await bannersRepository.listActiveBanners('homepage');
      const ids = homepageOnly.map((banner) => banner.id);

      expect(ids).toContain(homepage.body.data.id);
      expect(ids).not.toContain(campaign.body.data.id);
    });
  });

  describe('controller error forwarding', () => {
    it('forwards a service error from GET /api/v1/home to the error handler', async () => {
      const spy = vi
        .spyOn(bannersRepository, 'listActiveBanners')
        .mockRejectedValueOnce(new Error('boom'));

      const response = await request(app).get('/api/v1/home');

      expect(response.status).toBe(500);
      spy.mockRestore();
    });
  });
});
