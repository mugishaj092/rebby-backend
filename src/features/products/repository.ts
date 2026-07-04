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
};
