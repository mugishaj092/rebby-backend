import { Router } from 'express';

import { getHomeSections } from './controller';

// Public home-screen read — mounted at /api/v1/home
export const homeRouter = Router();

homeRouter.get('/', getHomeSections);
