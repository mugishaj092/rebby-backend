import { Router } from 'express';

import { requireStaff } from '@/core/middleware/requireStaff';
import { validate } from '@/core/middleware/validate';
import { StaffRole } from '@/generated/prisma/enums';

import {
  addVariant,
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  getCategory,
  getCategoryTree,
  listCategories,
  removeVariant,
  updateCategory,
  updateProduct,
  updateVariant,
} from './controller';
import {
  addVariantSchema,
  categoryIdParamsSchema,
  createCategorySchema,
  createProductSchema,
  listCategoriesQuerySchema,
  productIdParamsSchema,
  updateCategorySchema,
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
