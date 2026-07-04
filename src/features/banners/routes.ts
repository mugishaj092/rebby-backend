import { Router } from 'express';

import { requireStaff } from '@/core/middleware/requireStaff';
import { validate } from '@/core/middleware/validate';
import { StaffRole } from '@/generated/prisma/enums';

import { createBanner, deleteBanner, updateBanner } from './controller';
import { bannerIdParamsSchema, createBannerSchema, updateBannerSchema } from './schema';

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
