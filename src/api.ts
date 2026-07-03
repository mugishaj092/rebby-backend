import { Router } from 'express';

import { authRouter, debugRouter, staffAuthRouter } from '@/features/auth/routes';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/admin/auth', staffAuthRouter);
apiRouter.use('/_debug', debugRouter);
