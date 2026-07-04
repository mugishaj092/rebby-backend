import { prisma } from '@/db/prisma';
import type { Prisma } from '@/generated/prisma/client';

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

export const variantsRepository = {
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
};
