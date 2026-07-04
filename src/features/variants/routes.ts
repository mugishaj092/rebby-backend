import { Router } from 'express';

import { requireStaff } from '@/core/middleware/requireStaff';
import { validate } from '@/core/middleware/validate';
import { StaffRole } from '@/generated/prisma/enums';

import { addVariant, removeVariant, updateVariant } from './controller';
import {
  addVariantSchema,
  productIdParamsSchema,
  updateVariantSchema,
  variantIdParamsSchema,
} from './schema';

// Staff-only — mounted at /api/v1/admin/products/:id/variants (mergeParams so `:id`,
// the parent product's id, is visible to this router even though it owns none of the
// products feature's other routes).
export const productVariantsRouter = Router({ mergeParams: true });

productVariantsRouter.post(
  '/',
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
