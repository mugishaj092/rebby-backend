import { NextFunction, Request, Response } from 'express';

import * as catalogService from './service';
import type {
  AddVariantInput,
  CategoryIdParams,
  CreateCategoryInput,
  CreateProductInput,
  ListCategoriesQuery,
  ProductIdParams,
  UpdateCategoryInput,
  UpdateProductInput,
  UpdateVariantInput,
  VariantIdParams,
} from './schema';

export async function listCategories(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = req.query as unknown as ListCategoriesQuery;
    const categories = await catalogService.listCategories(query);
    res.status(200).json({ success: true, data: categories });
  } catch (err) {
    next(err);
  }
}

export async function getCategoryTree(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tree = await catalogService.getCategoryTree();
    res.status(200).json({ success: true, data: tree });
  } catch (err) {
    next(err);
  }
}

export async function getCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params as unknown as CategoryIdParams;
    const category = await catalogService.getCategory(id);
    res.status(200).json({ success: true, data: category });
  } catch (err) {
    next(err);
  }
}

export async function createCategory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = req.body as CreateCategoryInput;
    const category = await catalogService.createCategory(req.staff!.id, input);
    res.status(201).json({ success: true, data: category });
  } catch (err) {
    next(err);
  }
}

export async function updateCategory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as CategoryIdParams;
    const input = req.body as UpdateCategoryInput;
    const category = await catalogService.updateCategory(req.staff!.id, id, input);
    res.status(200).json({ success: true, data: category });
  } catch (err) {
    next(err);
  }
}

export async function deleteCategory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as CategoryIdParams;
    await catalogService.deleteCategory(req.staff!.id, id);
    res.status(200).json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
}

export async function createProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = req.body as CreateProductInput;
    const product = await catalogService.createProduct(req.staff!.id, input);
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
    const product = await catalogService.updateProduct(req.staff!.id, id, input);
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
    await catalogService.deleteProduct(req.staff!.id, id);
    res.status(200).json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
}

export async function addVariant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as ProductIdParams;
    const input = req.body as AddVariantInput;
    const variant = await catalogService.addVariant(req.staff!.id, id, input);
    res.status(201).json({ success: true, data: variant });
  } catch (err) {
    next(err);
  }
}

export async function updateVariant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as VariantIdParams;
    const input = req.body as UpdateVariantInput;
    const variant = await catalogService.updateVariant(req.staff!.id, id, input);
    res.status(200).json({ success: true, data: variant });
  } catch (err) {
    next(err);
  }
}

export async function removeVariant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as VariantIdParams;
    await catalogService.removeVariant(req.staff!.id, id);
    res.status(200).json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
}
