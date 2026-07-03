import { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';

import { env } from '@/config/env';

// IP-based limiter for credential-submission endpoints (register/login/staff-login) — blunts
// brute-force/credential-stuffing volume. The stricter, more targeted per-email defense against
// credential stuffing is account lockout (failedLoginAttempts/lockedUntil), not this limiter —
// see features/auth/service.ts.
//
// Skipped entirely in the test env: this is a module-level singleton, so its counter persists
// across every test in the process that hits these routes via supertest — without the skip,
// unrelated tests would start intermittently getting 429s once more than 10 accumulate in a
// minute. The dedicated rate-limit test re-enables it deterministically via a fresh module
// import with NODE_ENV temporarily overridden (see tests/features/auth/auth.routes.test.ts).
export const authRateLimit: RequestHandler = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again shortly.' },
    });
  },
});
