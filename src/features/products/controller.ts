import { NextFunction, Request, Response } from 'express';

import type { CursorPaginationQuery } from '@/core/validation/pagination';

import * as productsService from './service';
import type {
  CreateProductInput,
  ListProductsQuery,
  ProductIdOrSlugParams,
  ProductIdParams,
  UpdateProductInput,
} from './schema';

export async function createProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = req.body as CreateProductInput;
    const product = await productsService.createProduct(req.staff!.id, input);
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
}

export async function updateProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as ProductIdParams;
    const input = req.body as UpdateProductInput;
    const product = await productsService.updateProduct(req.staff!.id, id, input);
    res.status(200).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
}

export async function deleteProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as ProductIdParams;
    await productsService.deleteProduct(req.staff!.id, id);
    res.status(200).json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
}

export async function listProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as unknown as ListProductsQuery;
    const page = await productsService.listProducts(query);
    res.status(200).json({ success: true, data: page });
  } catch (err) {
    next(err);
  }
}

export async function getProductDetail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { idOrSlug } = req.params as unknown as ProductIdOrSlugParams;
    const product = await productsService.getProductDetail(idOrSlug);
    res.status(200).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
}

// Mounted (via api.ts) at /api/v1/categories/:id/products — kept inside the products feature
// rather than categories, since categories must not depend on products (architecture.md's
// dependency direction is products -> categories, and products/service.ts already depends on
// categoriesService; the reverse edge would create a circular feature dependency).
export async function listProductsByCategory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as ProductIdParams;
    const { cursor, limit } = req.query as unknown as CursorPaginationQuery;
    const page = await productsService.listProducts({
      categoryId: id,
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
