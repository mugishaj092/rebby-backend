import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodSchema } from 'zod';

import { ValidationError } from '@/core/errors/AppError';

type ValidationSource = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, source: ValidationSource = 'body'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      throw new ValidationError('Request validation failed', result.error.issues);
    }

    (req as unknown as Record<ValidationSource, unknown>)[source] = result.data;
    next();
  };
}
