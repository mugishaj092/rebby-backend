import { Router } from 'express';

import { requireStaff } from '@/core/middleware/requireStaff';
import { validate } from '@/core/middleware/validate';
import { StaffRole } from '@/generated/prisma/enums';

import {
  createProduct,
  deleteProduct,
  getProductDetail,
  listProducts,
  listProductsByCategory,
  updateProduct,
} from './controller';
import {
  createProductSchema,
  listProductsQuerySchema,
  productIdOrSlugParamsSchema,
  productIdParamsSchema,
  updateProductSchema,
} from './schema';

// Public catalog reads — mounted at /api/v1/products
export const productsRouter = Router();

productsRouter.get('/', validate(listProductsQuerySchema, 'query'), listProducts);
productsRouter.get('/:idOrSlug', validate(productIdOrSlugParamsSchema, 'params'), getProductDetail);

// Public, category-scoped product listing — mounted (via api.ts) at
// /api/v1/categories/:id/products. mergeParams so `:id` from the parent mount pattern reaches
// this router's own handler.
export const categoryProductsRouter = Router({ mergeParams: true });

categoryProductsRouter.get(
  '/',
  validate(productIdParamsSchema, 'params'),
  validate(listProductsQuerySchema, 'query'),
  listProductsByCategory,
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
