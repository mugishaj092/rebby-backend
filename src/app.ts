import cookieParser from 'cookie-parser';
import cors, { CorsOptions } from 'cors';
import express, { Express, Request, Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';

import { apiRouter } from '@/api';
import { env } from '@/config/env';
import { errorHandler } from '@/core/middleware/errorHandler';
import { openApiDocument } from '@/docs/openapi';

function resolveCorsOrigin(): CorsOptions['origin'] {
  if (env.CORS_ORIGIN) {
    return env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
  }
  return env.NODE_ENV === 'development';
}

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(express.json());
  app.use(cookieParser());
  app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));
  // credentials: true is required for the refresh-token cookie to be sent/accepted cross-origin
  // (the admin dashboard and customer app are expected to run on different origins than the API).
  app.use(cors({ origin: resolveCorsOrigin(), credentials: true }));

  app.use('/api/v1', apiRouter);

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ success: true, data: { status: 'ok' } });
  });

  // Throwaway hand-written doc covering spec 05's routes only, for manual testing.
  // Superseded by the real generated spec in spec 35 — dev-only, never in production.
  if (env.NODE_ENV !== 'production') {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
    app.get('/api-docs.json', (_req: Request, res: Response) => {
      res.status(200).json(openApiDocument);
    });
  }

  app.use(errorHandler);

  return app;
}
