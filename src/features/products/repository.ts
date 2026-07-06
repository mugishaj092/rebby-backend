import { prisma } from '@/db/prisma';
import type { Prisma } from '@/generated/prisma/client';

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

const productListSelect = {
  id: true,
  name: true,
  slug: true,
  basePrice: true,
  compareAtPrice: true,
  images: {
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    take: 1,
    select: { url: true },
  },
  variants: {
    where: { stock: { gt: 0 } },
    take: 1,
    select: { id: true },
  },
} satisfies Prisma.ProductSelect;

type ProductListRow = Prisma.ProductGetPayload<{ select: typeof productListSelect }>;

export interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  basePrice: Prisma.Decimal;
  compareAtPrice: Prisma.Decimal | null;
  primaryImageUrl: string | null;
  inStock: boolean;
}

function toListItem(row: ProductListRow): ProductListItem {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    basePrice: row.basePrice,
    compareAtPrice: row.compareAtPrice,
    primaryImageUrl: row.images[0]?.url ?? null,
    inStock: row.variants.length > 0,
  };
}

interface ListProductsFilter {
  categoryId?: string;
  collectionId?: string;
  cursor?: string;
  limit: number;
}

export const productsRepository = {
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

  findActiveProductIds(productIds: string[]) {
    return prisma.product
      .findMany({
        where: { id: { in: productIds }, isActive: true, deletedAt: null },
        select: { id: true },
      })
      .then((rows) => rows.map((row) => row.id));
  },

  // A direct query against `product_variants` rather than a call into the variants feature's
  // service — createProduct/updateProduct need to pre-check SKU uniqueness for the variants
  // nested inside their own create/update payload, while variants.service already depends on
  // products.service the other way (verifying a product exists before adding/updating a
  // variant). Routing this pre-check through variants.service too would make products and
  // variants depend on each other circularly, which this codebase's architecture rules forbid.
  // The DB-level unique constraint (caught by runWithConflictGuard) is the real correctness
  // guarantee either way; this is just the fast, clean-rejection pre-check.
  findVariantBySku(sku: string) {
    return prisma.productVariant.findUnique({ where: { sku } });
  },

  // Two distinct query shapes behind one entry point: a plain product listing (optionally
  // scoped by category, ordered newest-first) vs. a collection-scoped listing, which must
  // instead respect `CollectionProduct.sortOrder` (spec 09's acceptance criterion) and so is
  // queried through the join table with a cursor on its compound `collectionId_productId` key.
  async listProducts({
    categoryId,
    collectionId,
    cursor,
    limit,
  }: ListProductsFilter): Promise<{ items: ProductListItem[]; hasMore: boolean }> {
    if (collectionId) {
      const rows = await prisma.collectionProduct.findMany({
        where: { collectionId, product: { isActive: true, deletedAt: null } },
        orderBy: [{ sortOrder: 'asc' }, { productId: 'asc' }],
        take: limit + 1,
        ...(cursor
          ? { cursor: { collectionId_productId: { collectionId, productId: cursor } }, skip: 1 }
          : {}),
        select: { productId: true, product: { select: productListSelect } },
      });

      const hasMore = rows.length > limit;
      return {
        items: rows.slice(0, limit).map((row) => toListItem(row.product)),
        hasMore,
      };
    }

    const rows = await prisma.product.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(categoryId ? { categoryId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: productListSelect,
    });

    const hasMore = rows.length > limit;
    return { items: rows.slice(0, limit).map(toListItem), hasMore };
  },

  findPublicProductDetailById(id: string) {
    return prisma.product.findFirst({
      where: { id, isActive: true, deletedAt: null },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        variants: true,
      },
    });
  },

  findPublicProductDetailBySlug(slug: string) {
    return prisma.product.findFirst({
      where: { slug, isActive: true, deletedAt: null },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        variants: true,
      },
    });
  },
};
