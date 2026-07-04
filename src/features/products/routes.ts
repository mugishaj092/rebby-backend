import { Router } from 'express';

import { requireStaff } from '@/core/middleware/requireStaff';
import { validate } from '@/core/middleware/validate';
import { StaffRole } from '@/generated/prisma/enums';

import { createProduct, deleteProduct, updateProduct } from './controller';
import { createProductSchema, productIdParamsSchema, updateProductSchema } from './schema';

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
