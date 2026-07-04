import { NextFunction, Request, Response } from 'express';

import * as productsService from './service';
import type { CreateProductInput, ProductIdParams, UpdateProductInput } from './schema';

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
