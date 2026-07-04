import { z } from 'zod';

import { idParamsSchema } from '@/core/validation/idParams';
import { moneySchema } from '@/core/validation/money';
import { cursorPaginationQuerySchema } from '@/core/validation/pagination';
import { slugSchema } from '@/core/validation/slug';
import { productVariantSchema } from '@/features/variants/schema';

const productImageSchema = z.object({
  url: z.string().trim().url().max(500),
  sortOrder: z.number().int().optional().default(0),
  isPrimary: z.boolean().optional().default(false),
});

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(191),
  slug: slugSchema(191).optional(),
  categoryId: z.string().uuid().optional(),
  description: z.string().trim().min(1).optional(),
  fabric: z.string().trim().min(1).max(255).optional(),
  careInstructions: z.string().trim().min(1).max(500).optional(),
  basePrice: moneySchema,
  compareAtPrice: moneySchema.optional(),
  images: z.array(productImageSchema).optional(),
  variants: z.array(productVariantSchema).min(1),
});

export const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(191).optional(),
  slug: slugSchema(191).optional(),
  categoryId: z.string().uuid().optional(),
  description: z.string().trim().min(1).optional(),
  fabric: z.string().trim().min(1).max(255).optional(),
  careInstructions: z.string().trim().min(1).max(500).optional(),
  basePrice: moneySchema.optional(),
  compareAtPrice: moneySchema.optional(),
});

export const productIdParamsSchema = idParamsSchema;

export const listProductsQuerySchema = cursorPaginationQuerySchema.extend({
  categoryId: z.string().uuid().optional(),
  collectionId: z.string().uuid().optional(),
});

export const productIdOrSlugParamsSchema = z.object({
  idOrSlug: z.string().trim().min(1),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductIdParams = z.infer<typeof productIdParamsSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type ProductIdOrSlugParams = z.infer<typeof productIdOrSlugParamsSchema>;
