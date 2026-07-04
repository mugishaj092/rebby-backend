import { prisma } from '@/db/prisma';
import type { Prisma } from '@/generated/prisma/client';

interface CategoryCreateData {
  name: string;
  slug: string;
  parentId: string | null;
  imageUrl: string | null;
  sortOrder: number;
}

interface CategoryUpdateData {
  name?: string;
  slug?: string;
  parentId?: string | null;
  imageUrl?: string | null;
  sortOrder?: number;
}

interface ListCategoriesFilter {
  parentId?: string | null;
  activeOnly?: boolean;
}

interface ProductImageCreateData {
  url: string;
  sortOrder: number;
  isPrimary: boolean;
}

interface ProductVariantCreateData {
  size: string;
  color: string;
  sku: string;
  priceOverride: Prisma.Decimal | null;
  stock: number;
}

interface ProductCreateData {
  name: string;
  slug: string;
  categoryId: string | null;
  description: string | null;
  fabric: string | null;
  careInstructions: string | null;
  basePrice: Prisma.Decimal;
  compareAtPrice: Prisma.Decimal | null;
  images: ProductImageCreateData[];
  variants: ProductVariantCreateData[];
}

interface ProductUpdateData {
  name?: string;
  slug?: string;
  categoryId?: string | null;
  description?: string | null;
  fabric?: string | null;
  careInstructions?: string | null;
  basePrice?: Prisma.Decimal;
  compareAtPrice?: Prisma.Decimal | null;
}

interface VariantCreateData {
  size: string;
  color: string;
  sku: string;
  priceOverride: Prisma.Decimal | null;
  stock: number;
}

interface VariantUpdateData {
  size?: string;
  color?: string;
  sku?: string;
  priceOverride?: Prisma.Decimal | null;
  stock?: number;
}

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

interface BannerCreateData {
  title: string;
  imageUrl: string;
  linkType: string;
  linkValue: string;
  placement: string;
  sortOrder: number;
  startsAt: Date | null;
  endsAt: Date | null;
}

interface BannerUpdateData {
  title?: string;
  imageUrl?: string;
  linkType?: string;
  linkValue?: string;
  placement?: string;
  sortOrder?: number;
  isActive?: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
}

export const catalogRepository = {
  createCategory(data: CategoryCreateData) {
    return prisma.category.create({ data });
  },

  updateCategory(id: string, data: CategoryUpdateData) {
    return prisma.category.update({ where: { id }, data });
  },

  deleteCategory(id: string) {
    return prisma.category.delete({ where: { id } });
  },

  findCategoryById(id: string) {
    return prisma.category.findUnique({ where: { id } });
  },

  findCategoryBySlug(slug: string) {
    return prisma.category.findUnique({ where: { slug } });
  },

  countActiveChildren(parentId: string) {
    return prisma.category.count({ where: { parentId, isActive: true } });
  },

  listCategories({ parentId, activeOnly }: ListCategoriesFilter) {
    return prisma.category.findMany({
      where: {
        ...(parentId !== undefined ? { parentId } : {}),
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  },

  listAllCategories(activeOnly?: boolean) {
    return prisma.category.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  },

  countActiveProductsByCategory(categoryId: string) {
    return prisma.product.count({ where: { categoryId, deletedAt: null } });
  },

  createProductWithVariants(data: ProductCreateData) {
    return prisma.product.create({
      data: {
        name: data.name,
        slug: data.slug,
        categoryId: data.categoryId,
        description: data.description,
        fabric: data.fabric,
        careInstructions: data.careInstructions,
        basePrice: data.basePrice,
        compareAtPrice: data.compareAtPrice,
        images: { create: data.images },
        variants: { create: data.variants },
      },
      include: { images: true, variants: true },
    });
  },

  updateProduct(id: string, data: ProductUpdateData) {
    return prisma.product.update({ where: { id }, data });
  },

  softDeleteProduct(id: string) {
    return prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  },

  findProductById(id: string, { includeDeleted = false }: { includeDeleted?: boolean } = {}) {
    return prisma.product.findFirst({
      where: { id, ...(includeDeleted ? {} : { deletedAt: null }) },
    });
  },

  findProductBySlug(slug: string) {
    return prisma.product.findUnique({ where: { slug } });
  },

  findVariantBySku(sku: string) {
    return prisma.productVariant.findUnique({ where: { sku } });
  },

  findVariantById(id: string) {
    return prisma.productVariant.findUnique({ where: { id } });
  },

  addVariant(productId: string, data: VariantCreateData) {
    return prisma.productVariant.create({ data: { productId, ...data } });
  },

  updateVariant(variantId: string, data: VariantUpdateData) {
    return prisma.productVariant.update({ where: { id: variantId }, data });
  },

  removeVariant(variantId: string) {
    return prisma.productVariant.delete({ where: { id: variantId } });
  },

  // ---- Collections & Banners (Spec 08) -------------------------

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

  setCollectionProducts(collectionId: string, productIds: string[]) {
    return prisma.$transaction([
      prisma.collectionProduct.deleteMany({ where: { collectionId } }),
      prisma.collectionProduct.createMany({
        data: productIds.map((productId, index) => ({
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

  findActiveProductIds(productIds: string[]) {
    return prisma.product
      .findMany({
        where: { id: { in: productIds }, isActive: true, deletedAt: null },
        select: { id: true },
      })
      .then((rows) => rows.map((row) => row.id));
  },

  createBanner(data: BannerCreateData) {
    return prisma.banner.create({ data });
  },

  updateBanner(id: string, data: BannerUpdateData) {
    return prisma.banner.update({ where: { id }, data });
  },

  deleteBanner(id: string) {
    return prisma.banner.delete({ where: { id } });
  },

  findBannerById(id: string) {
    return prisma.banner.findUnique({ where: { id } });
  },

  listActiveBanners(placement?: string) {
    const now = new Date();
    return prisma.banner.findMany({
      where: {
        isActive: true,
        ...(placement !== undefined ? { placement } : {}),
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  },
};
