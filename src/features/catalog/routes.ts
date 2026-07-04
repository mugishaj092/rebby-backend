import { Router } from 'express';

import { requireStaff } from '@/core/middleware/requireStaff';
import { validate } from '@/core/middleware/validate';
import { StaffRole } from '@/generated/prisma/enums';

import {
  addVariant,
  createBanner,
  createCategory,
  createCollection,
  createProduct,
  deleteBanner,
  deleteCategory,
  deleteCollection,
  deleteProduct,
  getCategory,
  getCategoryTree,
  getCollectionBySlug,
  getHomeSections,
  listActiveCollections,
  listCategories,
  removeVariant,
  updateBanner,
  updateCategory,
  updateCollection,
  updateCollectionProducts,
  updateProduct,
  updateVariant,
} from './controller';
import {
  addVariantSchema,
  bannerIdParamsSchema,
  categoryIdParamsSchema,
  collectionIdParamsSchema,
  collectionSlugParamsSchema,
  createBannerSchema,
  createCategorySchema,
  createCollectionSchema,
  createProductSchema,
  listCategoriesQuerySchema,
  productIdParamsSchema,
  setCollectionProductsSchema,
  updateBannerSchema,
  updateCategorySchema,
  updateCollectionSchema,
  updateProductSchema,
  updateVariantSchema,
  variantIdParamsSchema,
} from './schema';

// Public catalog reads — mounted at /api/v1/categories
export const categoriesRouter = Router();

categoriesRouter.get('/', validate(listCategoriesQuerySchema, 'query'), listCategories);
categoriesRouter.get('/tree', getCategoryTree);
categoriesRouter.get('/:id', validate(categoryIdParamsSchema, 'params'), getCategory);

// Staff-only catalog writes — mounted at /api/v1/admin/categories
export const adminCategoriesRouter = Router();

adminCategoriesRouter.post(
  '/',
  requireStaff(StaffRole.staff),
  validate(createCategorySchema),
  createCategory,
);
adminCategoriesRouter.patch(
  '/:id',
  requireStaff(StaffRole.staff),
  validate(categoryIdParamsSchema, 'params'),
  validate(updateCategorySchema),
  updateCategory,
);
adminCategoriesRouter.delete(
  '/:id',
  requireStaff(StaffRole.manager),
  validate(categoryIdParamsSchema, 'params'),
  deleteCategory,
);

// Staff-only product writes — mounted at /api/v1/admin/products
export const adminProductsRouter = Router();

adminProductsRouter.post(
  '/',
  requireStaff(StaffRole.staff),
  validate(createProductSchema),
  createProduct,
);
adminProductsRouter.patch(
  '/:id',
  requireStaff(StaffRole.staff),
  validate(productIdParamsSchema, 'params'),
  validate(updateProductSchema),
  updateProduct,
);
adminProductsRouter.delete(
  '/:id',
  requireStaff(StaffRole.manager),
  validate(productIdParamsSchema, 'params'),
  deleteProduct,
);
adminProductsRouter.post(
  '/:id/variants',
  requireStaff(StaffRole.staff),
  validate(productIdParamsSchema, 'params'),
  validate(addVariantSchema),
  addVariant,
);

// Staff-only variant writes — mounted at /api/v1/admin/variants
export const adminVariantsRouter = Router();

adminVariantsRouter.patch(
  '/:id',
  requireStaff(StaffRole.staff),
  validate(variantIdParamsSchema, 'params'),
  validate(updateVariantSchema),
  updateVariant,
);
adminVariantsRouter.delete(
  '/:id',
  requireStaff(StaffRole.manager),
  validate(variantIdParamsSchema, 'params'),
  removeVariant,
);

// Public home-screen read — mounted at /api/v1/home
export const homeRouter = Router();

homeRouter.get('/', getHomeSections);

// Public catalog reads — mounted at /api/v1/collections
export const collectionsRouter = Router();

collectionsRouter.get('/', listActiveCollections);
collectionsRouter.get(
  '/:slug',
  validate(collectionSlugParamsSchema, 'params'),
  getCollectionBySlug,
);

// Staff-only collection writes — mounted at /api/v1/admin/collections
export const adminCollectionsRouter = Router();

adminCollectionsRouter.post(
  '/',
  requireStaff(StaffRole.staff),
  validate(createCollectionSchema),
  createCollection,
);
adminCollectionsRouter.patch(
  '/:id',
  requireStaff(StaffRole.staff),
  validate(collectionIdParamsSchema, 'params'),
  validate(updateCollectionSchema),
  updateCollection,
);
adminCollectionsRouter.put(
  '/:id/products',
  requireStaff(StaffRole.staff),
  validate(collectionIdParamsSchema, 'params'),
  validate(setCollectionProductsSchema),
  updateCollectionProducts,
);
adminCollectionsRouter.delete(
  '/:id',
  requireStaff(StaffRole.manager),
  validate(collectionIdParamsSchema, 'params'),
  deleteCollection,
);

// Staff-only banner writes — mounted at /api/v1/admin/banners
export const adminBannersRouter = Router();

adminBannersRouter.post(
  '/',
  requireStaff(StaffRole.staff),
  validate(createBannerSchema),
  createBanner,
);
adminBannersRouter.patch(
  '/:id',
  requireStaff(StaffRole.staff),
  validate(bannerIdParamsSchema, 'params'),
  validate(updateBannerSchema),
  updateBanner,
);
adminBannersRouter.delete(
  '/:id',
  requireStaff(StaffRole.manager),
  validate(bannerIdParamsSchema, 'params'),
  deleteBanner,
);
