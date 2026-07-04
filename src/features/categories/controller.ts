import { NextFunction, Request, Response } from 'express';

import * as categoriesService from './service';
import type {
  CategoryIdParams,
  CreateCategoryInput,
  ListCategoriesQuery,
  UpdateCategoryInput,
} from './schema';

export async function listCategories(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = req.query as unknown as ListCategoriesQuery;
    const categories = await categoriesService.listCategories(query);
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
    const tree = await categoriesService.getCategoryTree();
    res.status(200).json({ success: true, data: tree });
  } catch (err) {
    next(err);
  }
}

export async function getCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params as unknown as CategoryIdParams;
    const category = await categoriesService.getCategory(id);
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
    const category = await categoriesService.createCategory(req.staff!.id, input);
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
    const category = await categoriesService.updateCategory(req.staff!.id, id, input);
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
    await categoriesService.deleteCategory(req.staff!.id, id);
    res.status(200).json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
}
