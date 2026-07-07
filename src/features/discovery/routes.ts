import { Router } from 'express';

import { validate } from '@/core/middleware/validate';

import { search, searchBySku } from './controller';
import { searchQuerySchema, skuSearchParamsSchema } from './schema';

// Public — mounted (via api.ts) at /api/v1/search
export const discoveryRouter = Router();

discoveryRouter.get('/', validate(searchQuerySchema, 'query'), search);
discoveryRouter.get('/sku/:sku', validate(skuSearchParamsSchema, 'params'), searchBySku);
