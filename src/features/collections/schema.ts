import { z } from 'zod';

import { idParamsSchema } from '@/core/validation/idParams';
import { slugSchema } from '@/core/validation/slug';

export const createCollectionSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    slug: slugSchema(150).optional(),
    description: z.string().trim().min(1).max(500).optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    productIds: z.array(z.string().uuid()).optional(),
  })
  .refine((data) => !data.startsAt || !data.endsAt || data.endsAt > data.startsAt, {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  });

export const updateCollectionSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  slug: slugSchema(150).optional(),
  description: z.string().trim().min(1).max(500).optional(),
  isActive: z.boolean().optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
});

export const setCollectionProductsSchema = z.object({
  productIds: z.array(z.string().uuid()).min(0),
});

export const collectionIdParamsSchema = idParamsSchema;

export const collectionSlugParamsSchema = z.object({
  slug: slugSchema(150),
});

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;
export type SetCollectionProductsInput = z.infer<typeof setCollectionProductsSchema>;
export type CollectionIdParams = z.infer<typeof collectionIdParamsSchema>;
export type CollectionSlugParams = z.infer<typeof collectionSlugParamsSchema>;
