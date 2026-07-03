import { Router } from 'express';

import { authRouter, debugRouter, staffAuthRouter } from '@/features/auth/routes';
import { adminCategoriesRouter, categoriesRouter } from '@/features/catalog/routes';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/admin/auth', staffAuthRouter);
apiRouter.use('/categories', categoriesRouter);
apiRouter.use('/admin/categories', adminCategoriesRouter);
apiRouter.use('/_debug', debugRouter);
