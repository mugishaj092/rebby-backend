import * as productsService from '@/features/products/service';
import { ConflictError, NotFoundError } from '@/core/errors/AppError';
import { conflictFieldsFromError } from '@/core/errors/prismaConflict';
import { withNotFoundOnP2025 } from '@/core/errors/prismaRaceGuard';
import { Prisma } from '@/generated/prisma/client';
import type { ProductVariant } from '@/generated/prisma/client';

import { variantsRepository } from './repository';
import type { AddVariantInput, UpdateVariantInput } from './schema';

function conflictMessageForFields(fields: string[]): string {
  if (fields.includes('sku')) {
    return 'A variant with this SKU already exists';
  }
  if (fields.includes('size') || fields.includes('color') || fields.includes('product_id')) {
    return 'This product already has a variant with this size and color combination';
  }
  return 'A conflicting record already exists';
}

// The pre-checks below (SKU lookups) are check-then-act, not atomic — two concurrent staff
// requests can both pass them before either write commits. This catches the resulting DB-level
// unique constraint violation so it still surfaces as a clean ConflictError, mirroring the same
// guard already applied to category/product slugs.
async function runWithConflictGuard<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError(conflictMessageForFields(conflictFieldsFromError(err)));
    }
    throw err;
  }
}

export async function addVariant(
  _staffId: string,
  productId: string,
  input: AddVariantInput,
): Promise<ProductVariant> {
  if (!(await productsService.productExists(productId))) {
    throw new NotFoundError('Product not found');
  }

  const existingSku = await variantsRepository.findVariantBySku(input.sku);
  if (existingSku) {
    throw new ConflictError(`SKU already exists: ${input.sku}`);
  }

  return runWithConflictGuard(() =>
    variantsRepository.addVariant(productId, {
      size: input.size,
      color: input.color,
      sku: input.sku,
      priceOverride: input.priceOverride ? new Prisma.Decimal(input.priceOverride) : null,
      stock: input.stock,
    }),
  );
}

// Allowed to write `stock` directly — this is a deliberate, narrow exception to the golden
// rule that ProductVariant.stock only changes through the inventory choke point
// (commitOrderStock/releaseOrderStock, Spec 17). This function exists for administrative stock
// correction at the catalog-management level (e.g. a staff member reconciling a manual stock
// count), never for order-driven fulfillment — order/checkout code must not call this.
export async function updateVariant(
  _staffId: string,
  variantId: string,
  input: UpdateVariantInput,
): Promise<ProductVariant> {
  const variant = await variantsRepository.findVariantById(variantId);
  if (!variant) {
    throw new NotFoundError('Variant not found');
  }

  if (input.sku && input.sku !== variant.sku) {
    const existingSku = await variantsRepository.findVariantBySku(input.sku);
    if (existingSku) {
      throw new ConflictError(`SKU already exists: ${input.sku}`);
    }
  }

  return withNotFoundOnP2025(
    () =>
      runWithConflictGuard(() =>
        variantsRepository.updateVariant(variantId, {
          ...(input.size !== undefined ? { size: input.size } : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
          ...(input.sku !== undefined ? { sku: input.sku } : {}),
          ...(input.priceOverride !== undefined
            ? { priceOverride: new Prisma.Decimal(input.priceOverride) }
            : {}),
          ...(input.stock !== undefined ? { stock: input.stock } : {}),
        }),
      ),
    'Variant not found',
  );
}

export async function removeVariant(_staffId: string, variantId: string): Promise<void> {
  const variant = await variantsRepository.findVariantById(variantId);
  if (!variant) {
    throw new NotFoundError('Variant not found');
  }

  await withNotFoundOnP2025(() => variantsRepository.removeVariant(variantId), 'Variant not found');
}
