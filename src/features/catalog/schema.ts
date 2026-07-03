import { z } from 'zod';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(150)
  .regex(SLUG_PATTERN, 'Invalid slug format');

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(150),
  slug: slugSchema.optional(),
  parentId: z.string().uuid().optional(),
  imageUrl: z.string().trim().url().max(500).optional(),
  sortOrder: z.number().int().optional().default(0),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  slug: slugSchema.optional(),
  parentId: z.string().uuid().optional(),
  imageUrl: z.string().trim().url().max(500).optional(),
  sortOrder: z.number().int().optional(),
});

export const categoryIdParamsSchema = z.object({
  id: z.string().uuid(),
});

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
