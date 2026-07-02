import { describe, expect, it } from 'vitest';

import {
  AppError,
  ConflictError,
  ForbiddenError,
  InsufficientStockError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/core/errors/AppError';

describe('typed application errors', () => {
  it('NotFoundError carries statusCode 404 and code NOT_FOUND', () => {
    const err = new NotFoundError('Order not found');
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Order not found');
  });

  it('ValidationError carries statusCode 422, code VALIDATION_ERROR, and details', () => {
    const details = [{ path: ['field'], message: 'required' }];
    const err = new ValidationError('Invalid payload', details);
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toEqual(details);
  });

  it('InsufficientStockError carries statusCode 409 and code INSUFFICIENT_STOCK', () => {
    const err = new InsufficientStockError('Not enough stock');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('INSUFFICIENT_STOCK');
  });

  it('ForbiddenError carries statusCode 403 and code FORBIDDEN', () => {
    const err = new ForbiddenError('Not allowed');
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });

  it('UnauthorizedError carries statusCode 401 and code UNAUTHORIZED', () => {
    const err = new UnauthorizedError('Missing session');
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('ConflictError carries statusCode 409 and code CONFLICT', () => {
    const err = new ConflictError('Invalid status transition');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });
});
