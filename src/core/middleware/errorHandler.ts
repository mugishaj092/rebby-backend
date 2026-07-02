import { ErrorRequestHandler } from 'express';

import { AppError } from '@/core/errors/AppError';
import { logger } from '@/core/utils/logger';

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const context = `${req.method} ${req.path}`;

  if (err instanceof AppError) {
    logger.error(`[${context}] ${err.message}`);

    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  // TODO(later spec): Sentry.captureException(err)
  logger.error(`[${context}] Unhandled error`, err);

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong.',
    },
  });
};
