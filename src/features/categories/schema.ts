import { z } from 'zod';

import { idParamsSchema } from '@/core/validation/idParams';
import { slugSchema } from '@/core/validation/slug';

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(150),
  slug: slugSchema(150).optional(),
  parentId: z.string().uuid().optional(),
  imageUrl: z.string().trim().url().max(500).optional(),
  sortOrder: z.number().int().optional().default(0),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  slug: slugSchema(150).optional(),
  parentId: z.string().uuid().optional(),
  imageUrl: z.string().trim().url().max(500).optional(),
  sortOrder: z.number().int().optional(),
});

export const categoryIdParamsSchema = idParamsSchema;

export const listCategoriesQuerySchema = z.object({
  parentId: z.string().uuid().optional(),
  activeOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CategoryIdParams = z.infer<typeof categoryIdParamsSchema>;
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;
