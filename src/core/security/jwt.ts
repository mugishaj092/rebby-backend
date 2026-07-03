import { createHash, randomBytes } from 'node:crypto';

import jwt from 'jsonwebtoken';

import { env } from '@/config/env';
import { UnauthorizedError } from '@/core/errors/AppError';
import { StaffRole } from '@/generated/prisma/enums';

export type AccountType = 'customer' | 'staff';

export interface AccessTokenPayload {
  sub: string;
  type: AccountType;
  email: string;
  role?: StaffRole;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL_MINUTES * 60 });
}

// Access tokens are verified statelessly — signature + expiry only, no DB round trip per
// request — for performance. This means an account deactivation, role change, or lock takes up
// to ACCESS_TOKEN_TTL_MINUTES to propagate to an already-issued access token. Accepted tradeoff
// given the short TTL; immediate revocation would need either a DB check per request (defeats
// the performance purpose) or a short-lived denylist — both explicitly out of scope (spec 05).
export function verifyAccessToken(token: string): AccessTokenPayload {
  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }

  const isValidType = typeof decoded !== 'string' && (decoded.type === 'customer' || decoded.type === 'staff');
  const isValidRole =
    typeof decoded !== 'string' &&
    (decoded.type !== 'staff' ||
      decoded.role === StaffRole.staff ||
      decoded.role === StaffRole.manager ||
      decoded.role === StaffRole.owner);

  if (
    typeof decoded === 'string' ||
    typeof decoded.sub !== 'string' ||
    typeof decoded.email !== 'string' ||
    !isValidType ||
    !isValidRole
  ) {
    throw new UnauthorizedError('Malformed access token');
  }

  return {
    sub: decoded.sub,
    type: decoded.type as AccountType,
    email: decoded.email,
    role: decoded.type === 'staff' ? (decoded.role as StaffRole) : undefined,
  };
}

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export interface GeneratedRefreshToken {
  raw: string;
  hash: string;
}

export function generateRefreshToken(): GeneratedRefreshToken {
  const raw = randomBytes(32).toString('hex');
  return { raw, hash: hashRefreshToken(raw) };
}
