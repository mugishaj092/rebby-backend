import { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { NotFoundError } from '@/core/errors/AppError';
import { errorHandler } from '@/core/middleware/errorHandler';

describe('errorHandler (unit)', () => {
  it('defers to next(err) instead of writing a response when headers were already sent', () => {
    const req = { method: 'GET', path: '/stream' } as unknown as Request;
    const res = {
      headersSent: true,
      status: vi.fn(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn() as NextFunction;
    const err = new NotFoundError('Order not found');

    errorHandler(err, req, res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
