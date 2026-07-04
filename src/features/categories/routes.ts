import { Router } from 'express';

import { requireStaff } from '@/core/middleware/requireStaff';
import { validate } from '@/core/middleware/validate';
import { StaffRole } from '@/generated/prisma/enums';

import {
  createCategory,
  deleteCategory,
  getCategory,
  getCategoryTree,
  listCategories,
  updateCategory,
} from './controller';
import {
  categoryIdParamsSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
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
