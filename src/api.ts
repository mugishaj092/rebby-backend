import { Router } from 'express';

import { authRouter, debugRouter, staffAuthRouter } from '@/features/auth/routes';
import { adminBannersRouter } from '@/features/banners/routes';
import { adminCategoriesRouter, categoriesRouter } from '@/features/categories/routes';
import { adminCollectionsRouter, collectionsRouter } from '@/features/collections/routes';
import { homeRouter } from '@/features/home/routes';
import {
  adminProductsRouter,
  categoryProductsRouter,
  productsRouter,
} from '@/features/products/routes';
import { adminVariantsRouter, productVariantsRouter } from '@/features/variants/routes';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/admin/auth', staffAuthRouter);
apiRouter.use('/categories', categoriesRouter);
apiRouter.use('/categories/:id/products', categoryProductsRouter);
apiRouter.use('/admin/categories', adminCategoriesRouter);
apiRouter.use('/products', productsRouter);
apiRouter.use('/admin/products', adminProductsRouter);
apiRouter.use('/admin/products/:id/variants', productVariantsRouter);
apiRouter.use('/admin/variants', adminVariantsRouter);
apiRouter.use('/home', homeRouter);
apiRouter.use('/collections', collectionsRouter);
apiRouter.use('/admin/collections', adminCollectionsRouter);
apiRouter.use('/admin/banners', adminBannersRouter);
apiRouter.use('/_debug', debugRouter);
