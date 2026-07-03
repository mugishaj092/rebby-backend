import { NextFunction, Request, RequestHandler, Response } from 'express';

import { ForbiddenError, UnauthorizedError } from '@/core/errors/AppError';
import { verifyAccessToken } from '@/core/security/jwt';

import { extractBearerToken } from './extractBearerToken';

export const requireCustomer: RequestHandler = (req: Request, _res: Response, next: NextFunction): void => {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      throw new UnauthorizedError('Authentication required');
    }

    const payload = verifyAccessToken(token);

    if (payload.type !== 'customer') {
      throw new ForbiddenError('Staff accounts cannot access customer routes');
    }

    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    next(err);
  }
};
