import { NextFunction, Request, Response } from 'express';

import * as discoveryService from './service';
import type { SearchQuery, SkuSearchParams } from './schema';

export async function search(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as unknown as SearchQuery;
    const page = await discoveryService.search(query);
    res.status(200).json({ success: true, data: page });
  } catch (err) {
    next(err);
  }
}

export async function searchBySku(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sku } = req.params as unknown as SkuSearchParams;
    const result = await discoveryService.searchBySku(sku);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
