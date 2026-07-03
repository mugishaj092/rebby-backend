import { Router } from 'express';

import { env } from '@/config/env';
import { requireCustomer } from '@/core/middleware/requireCustomer';
import { authRateLimit } from '@/core/middleware/rateLimit';
import { requireStaff } from '@/core/middleware/requireStaff';
import { validate } from '@/core/middleware/validate';
import { StaffRole } from '@/generated/prisma/enums';

import {
  login,
  logout,
  refresh,
  register,
  staffLogin,
  staffLogout,
  staffRefresh,
  staffWhoami,
  whoami,
} from './controller';
import { loginSchema, registerSchema } from './schema';

// Customer auth — mounted at /api/v1/auth
export const authRouter = Router();

authRouter.post('/register', authRateLimit, validate(registerSchema), register);
authRouter.post('/login', authRateLimit, validate(loginSchema), login);
authRouter.post('/refresh', refresh);
authRouter.post('/logout', logout);

// Staff auth — mounted at /api/v1/admin/auth. No registration endpoint: staff accounts are
// provisioned by an OWNER through staff-management endpoints (a later admin spec) or seeded
// directly for the first owner account — never self-service.
export const staffAuthRouter = Router();

staffAuthRouter.post('/login', authRateLimit, validate(loginSchema), staffLogin);
staffAuthRouter.post('/refresh', staffRefresh);
staffAuthRouter.post('/logout', staffLogout);

// Throwaway routes proving requireCustomer/requireStaff end to end (spec 05 §10).
// Remove once a real protected route exists in a later spec.
export const debugRouter = Router();

if (env.NODE_ENV !== 'production') {
  debugRouter.get('/whoami', requireCustomer, whoami);
  debugRouter.get('/staff-whoami', requireStaff(StaffRole.staff), staffWhoami);
}
