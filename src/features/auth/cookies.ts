import { CookieOptions, Response } from 'express';

import { env } from '@/config/env';

export const CUSTOMER_REFRESH_COOKIE = 'reby_refresh_token';
export const STAFF_REFRESH_COOKIE = 'reby_staff_refresh_token';

// Path-scoped to the auth namespace (not just the literal /refresh path) so the same cookie
// is also sent on /logout, but never on unrelated routes — and never on the *other* account
// type's auth namespace, satisfying "a customer refresh cookie is never sent to
// /api/v1/admin/auth/refresh and vice versa".
export const CUSTOMER_AUTH_PATH = '/api/v1/auth';
export const STAFF_AUTH_PATH = '/api/v1/admin/auth';

function cookieOptions(path: string): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

export function setCustomerRefreshCookie(res: Response, token: string): void {
  res.cookie(CUSTOMER_REFRESH_COOKIE, token, cookieOptions(CUSTOMER_AUTH_PATH));
}

export function clearCustomerRefreshCookie(res: Response): void {
  res.clearCookie(CUSTOMER_REFRESH_COOKIE, { path: CUSTOMER_AUTH_PATH });
}

export function setStaffRefreshCookie(res: Response, token: string): void {
  res.cookie(STAFF_REFRESH_COOKIE, token, cookieOptions(STAFF_AUTH_PATH));
}

export function clearStaffRefreshCookie(res: Response): void {
  res.clearCookie(STAFF_REFRESH_COOKIE, { path: STAFF_AUTH_PATH });
}
