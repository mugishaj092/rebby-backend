import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { signAccessToken } from '@/core/security/jwt';
import { prisma } from '@/db/prisma';
import { StaffRole } from '@/generated/prisma/enums';

function uniqueName(prefix = 'Home'): string {
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

describe('features/home routes', () => {
  const app = createApp();
  const createdProductIds: string[] = [];
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

  async function createCollectionViaApi(
    overrides: Record<string, unknown> = {},
  ): Promise<request.Response> {
    const response = await request(app)
      .post('/api/v1/admin/collections')
      .set('Authorization', `Bearer ${staffToken()}`)
      .send({ name: uniqueName('Collection'), ...overrides });
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

  it('GET /api/v1/home works unauthenticated', async () => {
    const response = await request(app).get('/api/v1/home');
    expect(response.status).toBe(200);
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

    it('excludes a product from a collection entry once the product is soft-deleted', async () => {
      const productId = await createProduct();
      const collection = await createCollectionViaApi({ productIds: [productId] });

      await request(app)
        .delete(`/api/v1/admin/products/${productId}`)
        .set('Authorization', `Bearer ${staffToken(StaffRole.manager)}`);

      const response = await request(app).get('/api/v1/home');
      const collectionEntry = (
        response.body.data.collections as { id: string; products: { id: string }[] }[]
      ).find((c) => c.id === collection.body.data.id);

      expect(collectionEntry?.products).toHaveLength(0);
    });
  });
});
