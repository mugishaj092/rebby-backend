import { NextFunction, Request, RequestHandler, Response } from 'express';

import { meetsMinimumStaffRole } from '@/core/constants';
import { ForbiddenError, UnauthorizedError } from '@/core/errors/AppError';
import { verifyAccessToken } from '@/core/security/jwt';
import type { StaffRole } from '@/generated/prisma/enums';

import { extractBearerToken } from './extractBearerToken';

export function requireStaff(minRole: StaffRole): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const token = extractBearerToken(req);
      if (!token) {
        throw new UnauthorizedError('Authentication required');
      }

      const payload = verifyAccessToken(token);

      if (payload.type !== 'staff' || !payload.role) {
        throw new ForbiddenError('Customer accounts cannot access staff routes');
      }

      if (!meetsMinimumStaffRole(payload.role, minRole)) {
        throw new ForbiddenError('Insufficient staff role for this route');
      }

      req.staff = { id: payload.sub, email: payload.email, role: payload.role };
      next();
    } catch (err) {
      next(err);
    }
  };
}
