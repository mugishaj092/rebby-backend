import { prisma } from '@/db/prisma';

interface CollectionCreateData {
  name: string;
  slug: string;
  description: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
}

interface CollectionUpdateData {
  name?: string;
  slug?: string;
  description?: string | null;
  isActive?: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
}

export const collectionsRepository = {
  createCollection(data: CollectionCreateData) {
    return prisma.collection.create({ data });
  },

  updateCollection(id: string, data: CollectionUpdateData) {
    return prisma.collection.update({ where: { id }, data });
  },

  deleteCollection(id: string) {
    return prisma.collection.delete({ where: { id } });
  },

  findCollectionById(id: string) {
    return prisma.collection.findUnique({ where: { id } });
  },

  findCollectionBySlug(slug: string) {
    return prisma.collection.findUnique({ where: { slug } });
  },

  // Deduped before the write — CollectionProduct's compound primary key is
  // (collectionId, productId), so a duplicate id in the same createMany batch would otherwise
  // raise a raw P2002 instead of a clean result. First occurrence wins for sortOrder.
  setCollectionProducts(collectionId: string, productIds: string[]) {
    const uniqueIds = Array.from(new Set(productIds));
    return prisma.$transaction([
      prisma.collectionProduct.deleteMany({ where: { collectionId } }),
      prisma.collectionProduct.createMany({
        data: uniqueIds.map((productId, index) => ({
          collectionId,
          productId,
          sortOrder: index,
        })),
      }),
    ]);
  },

  listActiveCollections() {
    const now = new Date();
    return prisma.collection.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  findActiveCollectionBySlugWithProducts(slug: string) {
    const now = new Date();
    return prisma.collection.findFirst({
      where: {
        slug,
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      include: {
        products: {
          where: { product: { isActive: true, deletedAt: null } },
          orderBy: { sortOrder: 'asc' },
          include: { product: true },
        },
      },
    });
  },

  listActiveCollectionsWithProducts() {
    const now = new Date();
    return prisma.collection.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        products: {
          where: { product: { isActive: true, deletedAt: null } },
          orderBy: { sortOrder: 'asc' },
          include: { product: true },
        },
      },
    });
  },
};
