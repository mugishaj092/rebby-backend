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

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken, account, ...rest } = await authService.registerCustomer(req.body, requestContext(req));
    setCustomerRefreshCookie(res, refreshToken);
    res.status(201).json({ success: true, data: { ...rest, user: account } });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken, account, ...rest } = await authService.loginCustomer(req.body, requestContext(req));
    setCustomerRefreshCookie(res, refreshToken);
    res.status(200).json({ success: true, data: { ...rest, user: account } });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken = readCookie(req, CUSTOMER_REFRESH_COOKIE);
    if (!rawToken) {
      throw new UnauthorizedError('Missing refresh token');
    }
    const { refreshToken, ...rest } = await authService.refreshCustomerSession(rawToken, requestContext(req));
    setCustomerRefreshCookie(res, refreshToken);
    res.status(200).json({ success: true, data: rest });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken = readCookie(req, CUSTOMER_REFRESH_COOKIE);
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
