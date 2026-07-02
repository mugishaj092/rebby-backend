import express, { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  ConflictError,
  ForbiddenError,
  InsufficientStockError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/core/errors/AppError';
import { errorHandler } from '@/core/middleware/errorHandler';
import { sendSuccess } from '@/core/middleware/responseEnvelope';
import { validate } from '@/core/middleware/validate';
import { logger } from '@/core/utils/logger';

function buildTestApp(): Express {
  const app = express();
  app.use(express.json());

  app.get('/success', (_req, res) => {
    sendSuccess(res, { ok: true });
  });

  app.get('/errors/not-found', () => {
    throw new NotFoundError('Order not found');
  });

  app.get('/errors/validation', () => {
    throw new ValidationError('Invalid payload', [{ path: ['field'], message: 'required' }]);
  });

  app.get('/errors/insufficient-stock', () => {
    throw new InsufficientStockError('Not enough stock');
  });

  app.get('/errors/forbidden', () => {
    throw new ForbiddenError('Not allowed');
  });

  app.get('/errors/unauthorized', () => {
    throw new UnauthorizedError('Missing session');
  });

  app.get('/errors/conflict', () => {
    throw new ConflictError('Invalid status transition');
  });

  app.get('/errors/unhandled', () => {
    throw new Error('raw failure with a secret stack trace');
  });

  const bodySchema = z.object({ name: z.string().min(1) });
  app.post('/validate', validate(bodySchema), (req, res) => {
    sendSuccess(res, req.body);
  });

  app.use(errorHandler);

  return app;
}

describe('errorHandler (integration, temporary test routes)', () => {
  const app = buildTestApp();

  beforeEach(() => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the success envelope via sendSuccess', async () => {
    const res = await request(app).get('/success');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { ok: true } });
  });

  it('converts NotFoundError to a 404 envelope', async () => {
    const res = await request(app).get('/errors/not-found');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Order not found' },
    });
  });

  it('converts ValidationError to a 422 envelope with details', async () => {
    const res = await request(app).get('/errors/validation');
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid payload',
        details: [{ path: ['field'], message: 'required' }],
      },
    });
  });

  it('converts InsufficientStockError to a 409 envelope', async () => {
    const res = await request(app).get('/errors/insufficient-stock');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
  });

  it('converts ForbiddenError to a 403 envelope', async () => {
    const res = await request(app).get('/errors/forbidden');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('converts UnauthorizedError to a 401 envelope', async () => {
    const res = await request(app).get('/errors/unauthorized');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('converts ConflictError to a 409 envelope', async () => {
    const res = await request(app).get('/errors/conflict');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('returns a generic 500 envelope for an unhandled error, without leaking internals', async () => {
    const res = await request(app).get('/errors/unhandled');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
    });
    expect(JSON.stringify(res.body)).not.toContain('secret stack trace');
  });

  it('rejects an invalid body through validate() with a 422 envelope', async () => {
    const res = await request(app).post('/validate').send({});
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeDefined();
  });

  it('passes a valid body through validate() with req.body replaced by the parsed value', async () => {
    const res = await request(app).post('/validate').send({ name: 'Reby' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { name: 'Reby' } });
  });
});
