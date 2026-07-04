import { z } from 'zod';

import { idParamsSchema } from '@/core/validation/idParams';

const bannerLinkTypeSchema = z.enum(['product', 'category', 'collection', 'url']);
const bannerPlacementSchema = z.enum(['homepage', 'campaign']);

export const createBannerSchema = z
  .object({
    title: z.string().trim().min(1).max(191),
    imageUrl: z.string().trim().url().max(500),
    linkType: bannerLinkTypeSchema,
    linkValue: z.string().trim().min(1).max(500),
    placement: bannerPlacementSchema,
    sortOrder: z.number().int().optional().default(0),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
  })
  .refine((data) => !data.startsAt || !data.endsAt || data.endsAt > data.startsAt, {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  });

export const updateBannerSchema = z.object({
  title: z.string().trim().min(1).max(191).optional(),
  imageUrl: z.string().trim().url().max(500).optional(),
  linkType: bannerLinkTypeSchema.optional(),
  linkValue: z.string().trim().min(1).max(500).optional(),
  placement: bannerPlacementSchema.optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
});

export const bannerIdParamsSchema = idParamsSchema;

export type CreateBannerInput = z.infer<typeof createBannerSchema>;
export type UpdateBannerInput = z.infer<typeof updateBannerSchema>;
export type BannerIdParams = z.infer<typeof bannerIdParamsSchema>;
