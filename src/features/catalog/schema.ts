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

// ---- Products & Variants (Spec 07) ----------------------------

const productSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(191)
  .regex(SLUG_PATTERN, 'Invalid slug format');

const moneySchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a positive decimal string with up to 2 decimal places')
  .refine((value) => Number(value) > 0, 'Must be greater than 0');

const productImageSchema = z.object({
  url: z.string().trim().url().max(500),
  sortOrder: z.number().int().optional().default(0),
  isPrimary: z.boolean().optional().default(false),
});

const productVariantSchema = z.object({
  size: z.string().trim().min(1).max(20),
  color: z.string().trim().min(1).max(50),
  sku: z.string().trim().min(1).max(100),
  priceOverride: moneySchema.optional(),
  stock: z.number().int().nonnegative(),
});

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(191),
  slug: productSlugSchema.optional(),
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
  slug: productSlugSchema.optional(),
  categoryId: z.string().uuid().optional(),
  description: z.string().trim().min(1).optional(),
  fabric: z.string().trim().min(1).max(255).optional(),
  careInstructions: z.string().trim().min(1).max(500).optional(),
  basePrice: moneySchema.optional(),
  compareAtPrice: moneySchema.optional(),
});

export const addVariantSchema = productVariantSchema;

export const updateVariantSchema = z.object({
  size: z.string().trim().min(1).max(20).optional(),
  color: z.string().trim().min(1).max(50).optional(),
  sku: z.string().trim().min(1).max(100).optional(),
  priceOverride: moneySchema.optional(),
  stock: z.number().int().nonnegative().optional(),
});

export const productIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const variantIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type AddVariantInput = z.infer<typeof addVariantSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type ProductIdParams = z.infer<typeof productIdParamsSchema>;
export type VariantIdParams = z.infer<typeof variantIdParamsSchema>;

// ---- Collections & Banners (Spec 08) --------------------------

const collectionSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(150)
  .regex(SLUG_PATTERN, 'Invalid slug format');

export const createCollectionSchema = z.object({
  name: z.string().trim().min(1).max(150),
  slug: collectionSlugSchema.optional(),
  description: z.string().trim().min(1).max(500).optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  productIds: z.array(z.string().uuid()).optional(),
});

export const updateCollectionSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  slug: collectionSlugSchema.optional(),
  description: z.string().trim().min(1).max(500).optional(),
  isActive: z.boolean().optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
});

export const setCollectionProductsSchema = z.object({
  productIds: z.array(z.string().uuid()).min(0),
});

export const collectionIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const collectionSlugParamsSchema = z.object({
  slug: collectionSlugSchema,
});

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

export const bannerIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;
export type SetCollectionProductsInput = z.infer<typeof setCollectionProductsSchema>;
export type CollectionIdParams = z.infer<typeof collectionIdParamsSchema>;
export type CollectionSlugParams = z.infer<typeof collectionSlugParamsSchema>;
export type CreateBannerInput = z.infer<typeof createBannerSchema>;
export type UpdateBannerInput = z.infer<typeof updateBannerSchema>;
export type BannerIdParams = z.infer<typeof bannerIdParamsSchema>;
