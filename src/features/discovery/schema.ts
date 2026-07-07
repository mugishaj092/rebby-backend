import { z } from 'zod';

import { cursorPaginationQuerySchema } from '@/core/validation/pagination';

export const searchQuerySchema = cursorPaginationQuerySchema.extend({
  q: z.string().trim().min(1, 'q must not be empty').max(100),
});

export const skuSearchParamsSchema = z.object({
  sku: z.string().trim().min(1).max(100),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type SkuSearchParams = z.infer<typeof skuSearchParamsSchema>;
