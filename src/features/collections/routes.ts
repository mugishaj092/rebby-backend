import { Router } from 'express';

import { requireStaff } from '@/core/middleware/requireStaff';
import { validate } from '@/core/middleware/validate';
import { listProductsQuerySchema } from '@/features/products/schema';
import { StaffRole } from '@/generated/prisma/enums';

import {
  createCollection,
  deleteCollection,
  getCollectionBySlug,
  listActiveCollections,
  listCollectionProducts,
  updateCollection,
  updateCollectionProducts,
} from './controller';
import {
  collectionIdParamsSchema,
  collectionSlugParamsSchema,
  createCollectionSchema,
  setCollectionProductsSchema,
  updateCollectionSchema,
} from './schema';

// Public catalog reads — mounted at /api/v1/collections
export const collectionsRouter = Router();

collectionsRouter.get('/', listActiveCollections);
collectionsRouter.get(
  '/:slug/products',
  validate(collectionSlugParamsSchema, 'params'),
  validate(listProductsQuerySchema, 'query'),
  listCollectionProducts,
);
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
