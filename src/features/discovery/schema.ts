import { z } from 'zod';

import { moneySchema } from '@/core/validation/money';
import { cursorPaginationQuerySchema } from '@/core/validation/pagination';

import { PRODUCT_SORT_VALUES } from './types';

// A raw `"true"`/`"false"` query-string value coerced to a real boolean. `z.coerce.boolean()`
// can't be used here — it coerces via JS `Boolean(value)`, so the non-empty string `"false"`
// would coerce to `true`. Absent params transform to `false` (not filtered), matching
// `ProductFilters`' optional-boolean shape.
const booleanQueryParam = z
  .union([z.literal('true'), z.literal('false')])
  .optional()
  .transform((value) => value === 'true');

// Shared across `listProductsQuerySchema` (catalog) and `searchQuerySchema` (discovery) — this
// is the one place the combinable filter/sort query params are defined, per spec 11's point of
// unifying filtering/sorting into a single shared layer instead of duplicating it per endpoint.
export const productFilterQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
  size: z.string().trim().min(1).max(20).optional(),
  color: z.string().trim().min(1).max(50).optional(),
  minPrice: moneySchema.optional(),
  maxPrice: moneySchema.optional(),
  availability: z.enum(['in_stock', 'all']).optional().default('all'),
  newArrivals: booleanQueryParam,
  onSale: booleanQueryParam,
  sort: z.enum(PRODUCT_SORT_VALUES).optional().default('newest'),
});

// Shared `minPrice <= maxPrice` refinement — applied by each consuming schema after its own
// `.merge()`/`.extend()`, since `.refine()` (a `ZodEffects`) can't itself be merged further.
export function isValidPriceRange(data: { minPrice?: string; maxPrice?: string }): boolean {
  if (!data.minPrice || !data.maxPrice) {
    return true;
  }
  return Number(data.minPrice) <= Number(data.maxPrice);
}

export function priceRangeRefinement(): { message: string; path: string[] } {
  return {
    message: 'minPrice must be less than or equal to maxPrice',
    path: ['maxPrice'],
  };
}

export const searchQuerySchema = cursorPaginationQuerySchema
  .merge(productFilterQuerySchema)
  .extend({
    q: z.string().trim().min(1, 'q must not be empty').max(100),
  })
  .refine(isValidPriceRange, priceRangeRefinement());

export const skuSearchParamsSchema = z.object({
  sku: z.string().trim().min(1).max(100),
});

export type ProductFilterQuery = z.infer<typeof productFilterQuerySchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type SkuSearchParams = z.infer<typeof skuSearchParamsSchema>;
