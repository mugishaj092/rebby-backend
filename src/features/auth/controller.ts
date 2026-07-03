import { NextFunction, Request, Response } from 'express';

import { UnauthorizedError } from '@/core/errors/AppError';

import {
  CUSTOMER_REFRESH_COOKIE,
  STAFF_REFRESH_COOKIE,
  clearCustomerRefreshCookie,
  clearStaffRefreshCookie,
  setCustomerRefreshCookie,
  setStaffRefreshCookie,
} from './cookies';
import * as authService from './service';

export function requestContext(req: Request): authService.RequestContext {
  const userAgent = req.headers['user-agent'];
  return {
    ipAddress: req.ip ?? null,
    userAgent: typeof userAgent === 'string' ? userAgent : null,
  };
}

function readCookie(req: Request, name: string): string | undefined {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[name];
}

// Native/mobile clients (React Native + Expo) can't rely on a browser-style persistent cookie
// jar, so the customer flow also accepts the refresh token via the request body — stored
// client-side in expo-secure-store rather than a cookie. The staff/admin flow is a real browser
// client (the admin dashboard), so it stays cookie-only; see progress-tracker.md for the
// rationale.
function readBodyToken(req: Request): string | undefined {
  const body = req.body as Record<string, unknown> | undefined;
  const token = body?.refreshToken;
  return typeof token === 'string' ? token : undefined;
}

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { account, ...tokens } = await authService.registerCustomer(req.body, requestContext(req));
    setCustomerRefreshCookie(res, tokens.refreshToken);
    res.status(201).json({ success: true, data: { ...tokens, user: account } });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { account, ...tokens } = await authService.loginCustomer(req.body, requestContext(req));
    setCustomerRefreshCookie(res, tokens.refreshToken);
    res.status(200).json({ success: true, data: { ...tokens, user: account } });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken = readCookie(req, CUSTOMER_REFRESH_COOKIE) ?? readBodyToken(req);
    if (!rawToken) {
      throw new UnauthorizedError('Missing refresh token');
    }
    const tokens = await authService.refreshCustomerSession(rawToken, requestContext(req));
    setCustomerRefreshCookie(res, tokens.refreshToken);
    res.status(200).json({ success: true, data: tokens });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken = readCookie(req, CUSTOMER_REFRESH_COOKIE) ?? readBodyToken(req);
    if (rawToken) {
      await authService.logoutCustomer(rawToken);
    }
    clearCustomerRefreshCookie(res);
    res.status(200).json({ success: true, data: { loggedOut: true } });
  } catch (err) {
    next(err);
  }
}

export async function staffLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken, account, ...rest } = await authService.loginStaff(req.body, requestContext(req));
    setStaffRefreshCookie(res, refreshToken);
    res.status(200).json({ success: true, data: { ...rest, staff: account } });
  } catch (err) {
    next(err);
  }
}

export async function staffRefresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken = readCookie(req, STAFF_REFRESH_COOKIE);
    if (!rawToken) {
      throw new UnauthorizedError('Missing refresh token');
    }
    const { refreshToken, ...rest } = await authService.refreshStaffSession(rawToken, requestContext(req));
    setStaffRefreshCookie(res, refreshToken);
    res.status(200).json({ success: true, data: rest });
  } catch (err) {
    next(err);
  }
}

export async function staffLogout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken = readCookie(req, STAFF_REFRESH_COOKIE);
    if (rawToken) {
      await authService.logoutStaff(rawToken);
    }
    clearStaffRefreshCookie(res);
    res.status(200).json({ success: true, data: { loggedOut: true } });
  } catch (err) {
    next(err);
  }
}

export function whoami(req: Request, res: Response): void {
  res.status(200).json({ success: true, data: { user: req.user } });
}

export function staffWhoami(req: Request, res: Response): void {
  res.status(200).json({ success: true, data: { staff: req.staff } });
}
