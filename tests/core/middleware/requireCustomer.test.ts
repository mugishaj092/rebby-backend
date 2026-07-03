import { NextFunction, Request, Response } from 'express';
import jsonwebtoken from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';

import { env } from '@/config/env';
import { ForbiddenError, UnauthorizedError } from '@/core/errors/AppError';
import { requireCustomer } from '@/core/middleware/requireCustomer';
import { signAccessToken } from '@/core/security/jwt';
import { StaffRole } from '@/generated/prisma/enums';

function requestWithAuth(token?: string): Request {
  return { headers: token ? { authorization: `Bearer ${token}` } : {} } as unknown as Request;
}

describe('requireCustomer', () => {
  it('attaches req.user and calls next() for a valid customer access token', () => {
    const token = signAccessToken({ sub: 'user-1', type: 'customer', email: 'jane@example.com' });
    const req = requestWithAuth(token);
    const next = vi.fn() as NextFunction;

    requireCustomer(req, {} as Response, next);

    expect(req.user).toEqual({ id: 'user-1', email: 'jane@example.com' });
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next(UnauthorizedError) when there is no Authorization header', () => {
    const req = requestWithAuth();
    const next = vi.fn() as NextFunction;

    requireCustomer(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('calls next(UnauthorizedError) for an invalid/malformed token', () => {
    const req = requestWithAuth('not-a-real-jwt');
    const next = vi.fn() as NextFunction;

    requireCustomer(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('calls next(UnauthorizedError) for an expired token', () => {
    const token = jsonwebtoken.sign(
      { sub: 'user-1', type: 'customer', email: 'jane@example.com', exp: Math.floor(Date.now() / 1000) - 10 },
      env.JWT_ACCESS_SECRET,
    );
    const req = requestWithAuth(token);
    const next = vi.fn() as NextFunction;

    requireCustomer(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('calls next(ForbiddenError) when the token belongs to a staff account', () => {
    const token = signAccessToken({
      sub: 'staff-1',
      type: 'staff',
      email: 'staff@example.com',
      role: StaffRole.staff,
    });
    const req = requestWithAuth(token);
    const next = vi.fn() as NextFunction;

    requireCustomer(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });
});
