import { NextFunction, Request, Response } from 'express';

import * as catalogService from './service';
import type {
  AddVariantInput,
  BannerIdParams,
  CategoryIdParams,
  CollectionIdParams,
  CollectionSlugParams,
  CreateBannerInput,
  CreateCategoryInput,
  CreateCollectionInput,
  CreateProductInput,
  ListCategoriesQuery,
  ProductIdParams,
  SetCollectionProductsInput,
  UpdateBannerInput,
  UpdateCategoryInput,
  UpdateCollectionInput,
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

export async function addVariant(req: Request, res: Response, next: NextFunction): Promise<void> {
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

// ---- Collections & Banners (Spec 08) ---------------------------

export async function getHomeSections(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const sections = await catalogService.getHomeSections();
    res.status(200).json({ success: true, data: sections });
  } catch (err) {
    next(err);
  }
}

export async function listActiveCollections(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const collections = await catalogService.listActiveCollections();
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
    const collection = await catalogService.getCollectionBySlug(slug);
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
    const collection = await catalogService.createCollection(req.staff!.id, input);
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
    const collection = await catalogService.updateCollection(req.staff!.id, id, input);
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
    await catalogService.deleteCollection(req.staff!.id, id);
    res.status(200).json({ success: true, data: { deleted: true } });
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
    await catalogService.updateCollectionProducts(req.staff!.id, id, productIds);
    res.status(200).json({ success: true, data: { updated: true } });
  } catch (err) {
    next(err);
  }
}

export async function createBanner(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = req.body as CreateBannerInput;
    const banner = await catalogService.createBanner(req.staff!.id, input);
    res.status(201).json({ success: true, data: banner });
  } catch (err) {
    next(err);
  }
}

export async function updateBanner(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params as unknown as BannerIdParams;
    const input = req.body as UpdateBannerInput;
    const banner = await catalogService.updateBanner(req.staff!.id, id, input);
    res.status(200).json({ success: true, data: banner });
  } catch (err) {
    next(err);
  }
}

export async function deleteBanner(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params as unknown as BannerIdParams;
    await catalogService.deleteBanner(req.staff!.id, id);
    res.status(200).json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
}
