import { Router } from 'express';

import { authRouter, debugRouter, staffAuthRouter } from '@/features/auth/routes';
import {
  adminBannersRouter,
  adminCategoriesRouter,
  adminCollectionsRouter,
  adminProductsRouter,
  adminVariantsRouter,
  categoriesRouter,
  collectionsRouter,
  homeRouter,
} from '@/features/catalog/routes';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/admin/auth', staffAuthRouter);
apiRouter.use('/categories', categoriesRouter);
apiRouter.use('/admin/categories', adminCategoriesRouter);
apiRouter.use('/admin/products', adminProductsRouter);
apiRouter.use('/admin/variants', adminVariantsRouter);
apiRouter.use('/home', homeRouter);
apiRouter.use('/collections', collectionsRouter);
apiRouter.use('/admin/collections', adminCollectionsRouter);
apiRouter.use('/admin/banners', adminBannersRouter);
apiRouter.use('/_debug', debugRouter);
