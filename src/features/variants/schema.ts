import { z } from 'zod';

import { idParamsSchema } from '@/core/validation/idParams';
import { moneySchema } from '@/core/validation/money';

// Exported for products/schema.ts — createProductSchema nests this shape for the
// "product + variants + images in one call" creation flow (a schema-level import, not a
// service/repository one, so it doesn't create a cross-feature runtime dependency).
export const productVariantSchema = z.object({
  size: z.string().trim().min(1).max(20),
  color: z.string().trim().min(1).max(50),
  sku: z.string().trim().min(1).max(100),
  priceOverride: moneySchema.optional(),
  stock: z.number().int().nonnegative(),
});

export const addVariantSchema = productVariantSchema;

export const updateVariantSchema = z.object({
  size: z.string().trim().min(1).max(20).optional(),
  color: z.string().trim().min(1).max(50).optional(),
  sku: z.string().trim().min(1).max(100).optional(),
  priceOverride: moneySchema.optional(),
  stock: z.number().int().nonnegative().optional(),
});

// The parent product's :id in POST /api/v1/admin/products/:id/variants — a local copy rather
// than importing products/schema.ts's productIdParamsSchema, so this feature has no schema-level
// dependency on products either.
export const productIdParamsSchema = idParamsSchema;

export const variantIdParamsSchema = idParamsSchema;

export type AddVariantInput = z.infer<typeof addVariantSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type ProductIdParams = z.infer<typeof productIdParamsSchema>;
export type VariantIdParams = z.infer<typeof variantIdParamsSchema>;
