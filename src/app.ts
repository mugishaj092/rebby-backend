import cors, { CorsOptions } from 'cors';
import express, { Express, Request, Response } from 'express';
import morgan from 'morgan';

import { env } from '@/config/env';

function resolveCorsOrigin(): CorsOptions['origin'] {
  if (env.CORS_ORIGIN) {
    return env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
  }
  return env.NODE_ENV === 'development';
}

export function createApp(): Express {
  const app = express();

  app.use(express.json());
  app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));
  app.use(cors({ origin: resolveCorsOrigin() }));

  // TODO(spec 03): mount core middleware (error handler, rate limiting) here
  // TODO(spec 05+): mount feature routers via src/api.ts here

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ success: true, data: { status: 'ok' } });
  });

  return app;
}
