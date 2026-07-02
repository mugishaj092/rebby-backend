import { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ValidationError } from '@/core/errors/AppError';
import { validate } from '@/core/middleware/validate';

describe('validate middleware', () => {
  const schema = z.object({ name: z.string().min(1) });

  it('replaces req.body with the parsed value and calls next on success', () => {
    const req = { body: { name: 'Reby' } } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    validate(schema)(req, res, next);

    expect(req.body).toEqual({ name: 'Reby' });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('throws a ValidationError with field-level details on an invalid payload', () => {
    const req = { body: {} } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    expect(() => validate(schema)(req, res, next)).toThrow(ValidationError);
    expect(next).not.toHaveBeenCalled();
  });
});
