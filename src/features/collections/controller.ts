import { NextFunction, Request, Response } from 'express';

import type { CursorPaginationQuery } from '@/core/validation/pagination';
import * as productsService from '@/features/products/service';

import * as collectionsService from './service';
import type {
  CollectionIdParams,
  CollectionSlugParams,
  CreateCollectionInput,
  SetCollectionProductsInput,
  UpdateCollectionInput,
} from './schema';

export async function listActiveCollections(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const collections = await collectionsService.listActiveCollections();
    res.status(200).json({ success: true, data: collections });
  } catch (err) {
    next(err);
  }
}

export async function getCollectionBySlug(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { slug } = req.params as unknown as CollectionSlugParams;
    const collection = await collectionsService.getCollectionBySlug(slug);
    res.status(200).json({ success: true, data: collection });
  } catch (err) {
    next(err);
  }
}

export async function createCollection(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = req.body as CreateCollectionInput;
    const collection = await collectionsService.createCollection(req.staff!.id, input);
    res.status(201).json({ success: true, data: collection });
  } catch (err) {
    next(err);
  }
}

export async function updateCollection(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as CollectionIdParams;
    const input = req.body as UpdateCollectionInput;
    const collection = await collectionsService.updateCollection(req.staff!.id, id, input);
    res.status(200).json({ success: true, data: collection });
  } catch (err) {
    next(err);
  }
}

export async function deleteCollection(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as CollectionIdParams;
    await collectionsService.deleteCollection(req.staff!.id, id);
    res.status(200).json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
}

// Mounted at /api/v1/collections/:slug/products — a thin wrapper resolving the slug then
// delegating to products.service.listProducts, per spec 09's "do not duplicate the query logic".
export async function listCollectionProducts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { slug } = req.params as unknown as CollectionSlugParams;
    const { cursor, limit } = req.query as unknown as CursorPaginationQuery;
    const collectionId = await collectionsService.getCollectionIdBySlug(slug);
    const page = await productsService.listProducts({
      collectionId,
      cursor,
      limit,
      availability: 'all',
      newArrivals: false,
      onSale: false,
      sort: 'newest',
    });
    res.status(200).json({ success: true, data: page });
  } catch (err) {
    next(err);
  }
}

export async function updateCollectionProducts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as CollectionIdParams;
    const { productIds } = req.body as SetCollectionProductsInput;
    await collectionsService.updateCollectionProducts(req.staff!.id, id, productIds);
    res.status(200).json({ success: true, data: { updated: true } });
  } catch (err) {
    next(err);
  }
}
