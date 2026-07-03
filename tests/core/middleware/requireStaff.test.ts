import { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { ForbiddenError, UnauthorizedError } from '@/core/errors/AppError';
import { requireStaff } from '@/core/middleware/requireStaff';
import { signAccessToken } from '@/core/security/jwt';
import { StaffRole } from '@/generated/prisma/enums';

function requestWithAuth(token?: string): Request {
  return { headers: token ? { authorization: `Bearer ${token}` } : {} } as unknown as Request;
}

describe('requireStaff', () => {
  it('calls next() and attaches req.staff when staff meets the minimum role', () => {
    const token = signAccessToken({ sub: 'staff-1', type: 'staff', email: 'staff@example.com', role: StaffRole.staff });
    const req = requestWithAuth(token);
    const next = vi.fn() as NextFunction;

    requireStaff(StaffRole.staff)(req, {} as Response, next);

    expect(req.staff).toEqual({ id: 'staff-1', email: 'staff@example.com', role: StaffRole.staff });
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next(ForbiddenError) when a staff role is below the route minimum', () => {
    const token = signAccessToken({ sub: 'staff-1', type: 'staff', email: 'staff@example.com', role: StaffRole.staff });
    const req = requestWithAuth(token);
    const next = vi.fn() as NextFunction;

    requireStaff(StaffRole.owner)(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it('calls next() when an owner hits a route requiring only STAFF (hierarchy is inclusive upward)', () => {
    const token = signAccessToken({ sub: 'staff-1', type: 'staff', email: 'staff@example.com', role: StaffRole.owner });
    const req = requestWithAuth(token);
    const next = vi.fn() as NextFunction;

    requireStaff(StaffRole.staff)(req, {} as Response, next);

    expect(req.staff?.role).toBe(StaffRole.owner);
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next(ForbiddenError) when a customer token hits a staff route', () => {
    const token = signAccessToken({ sub: 'user-1', type: 'customer', email: 'jane@example.com' });
    const req = requestWithAuth(token);
    const next = vi.fn() as NextFunction;

    requireStaff(StaffRole.staff)(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it('calls next(UnauthorizedError) when there is no Authorization header', () => {
    const req = requestWithAuth();
    const next = vi.fn() as NextFunction;

    requireStaff(StaffRole.staff)(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('calls next(UnauthorizedError) for an invalid/malformed token', () => {
    const req = requestWithAuth('not-a-real-jwt');
    const next = vi.fn() as NextFunction;

    requireStaff(StaffRole.staff)(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });
});
