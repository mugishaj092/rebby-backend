import { env } from '@/config/env';
import { ACCOUNT_LOCK_MINUTES, ACCOUNT_LOCK_THRESHOLD } from '@/core/constants';
import { ConflictError, UnauthorizedError } from '@/core/errors/AppError';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from '@/core/security/password';
import {
  type AccessTokenPayload,
  type AccountType,
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from '@/core/security/jwt';
import type { StaffRole } from '@/generated/prisma/enums';

import { authRepository } from './repository';
import type { LoginInput, RegisterInput } from './schema';

export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  account: { id: string; email: string; name: string };
}

export interface StaffAuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  account: { id: string; email: string; name: string; role: StaffRole };
}

function isAccountLocked(lockedUntil: Date | null): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > Date.now();
}

async function issueTokenPair(
  payload: AccessTokenPayload,
  context: RequestContext,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const accessToken = signAccessToken(payload);
  const { raw, hash } = generateRefreshToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await authRepository.createRefreshToken({
    tokenHash: hash,
    tokenType: payload.type,
    userId: payload.type === 'customer' ? payload.sub : null,
    staffId: payload.type === 'staff' ? payload.sub : null,
    expiresAt,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  return { accessToken, refreshToken: raw, expiresIn: env.ACCESS_TOKEN_TTL_MINUTES * 60 };
}

export async function registerCustomer(input: RegisterInput, context: RequestContext): Promise<AuthResult> {
  const existing = await authRepository.findUserByEmail(input.email);
  if (existing) {
    throw new ConflictError('An account with this email already exists');
  }

  const passwordHash = await hashPassword(input.password);
  const user = await authRepository.createUser({
    name: input.name,
    email: input.email,
    passwordHash,
    phone: input.phone ?? null,
  });

  const tokens = await issueTokenPair({ sub: user.id, type: 'customer', email: user.email }, context);
  return { ...tokens, account: { id: user.id, email: user.email, name: user.name } };
}

export async function loginCustomer(input: LoginInput, context: RequestContext): Promise<AuthResult> {
  const user = await authRepository.findUserByEmail(input.email);

  // Always pay the same argon2.verify() cost, even when the account doesn't exist (or is
  // soft-deleted), so "unknown email" isn't distinguishable from "wrong password" by timing.
  const passwordMatches = await verifyPassword(
    user && !user.deletedAt ? user.passwordHash : DUMMY_PASSWORD_HASH,
    input.password,
  );

  if (!user || user.deletedAt) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (isAccountLocked(user.lockedUntil)) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!passwordMatches) {
    const attempts = await authRepository.incrementUserFailedAttempts(user.id);
    if (attempts >= ACCOUNT_LOCK_THRESHOLD) {
      await authRepository.lockUser(user.id, new Date(Date.now() + ACCOUNT_LOCK_MINUTES * 60 * 1000));
    }
    throw new UnauthorizedError('Invalid email or password');
  }

  await authRepository.resetUserLoginState(user.id);

  const tokens = await issueTokenPair({ sub: user.id, type: 'customer', email: user.email }, context);
  return { ...tokens, account: { id: user.id, email: user.email, name: user.name } };
}

export async function loginStaff(input: LoginInput, context: RequestContext): Promise<StaffAuthResult> {
  const staff = await authRepository.findStaffByEmail(input.email);

  const passwordMatches = await verifyPassword(
    staff && staff.isActive ? staff.passwordHash : DUMMY_PASSWORD_HASH,
    input.password,
  );

  if (!staff || !staff.isActive) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (isAccountLocked(staff.lockedUntil)) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!passwordMatches) {
    const attempts = await authRepository.incrementStaffFailedAttempts(staff.id);
    if (attempts >= ACCOUNT_LOCK_THRESHOLD) {
      await authRepository.lockStaff(staff.id, new Date(Date.now() + ACCOUNT_LOCK_MINUTES * 60 * 1000));
    }
    throw new UnauthorizedError('Invalid email or password');
  }

  await authRepository.resetStaffLoginState(staff.id);

  const tokens = await issueTokenPair(
    { sub: staff.id, type: 'staff', email: staff.email, role: staff.role },
    context,
  );
  return { ...tokens, account: { id: staff.id, email: staff.email, name: staff.name, role: staff.role } };
}

async function rotateRefreshToken(
  rawToken: string,
  expectedType: AccountType,
  context: RequestContext,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const tokenHash = hashRefreshToken(rawToken);
  const row = await authRepository.findRefreshTokenByHash(tokenHash);

  if (!row || row.tokenType !== expectedType) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  if (row.revokedAt) {
    // Reuse of an already-rotated (or already-logged-out) token — treat as possible theft and
    // revoke the entire token family for this account, forcing a full re-login everywhere.
    if (row.userId) {
      await authRepository.revokeAllActiveRefreshTokensForUser(row.userId);
    }
    if (row.staffId) {
      await authRepository.revokeAllActiveRefreshTokensForStaff(row.staffId);
    }
    throw new UnauthorizedError('Invalid refresh token');
  }

  if (row.expiresAt.getTime() < Date.now()) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  const accountId = row.userId ?? row.staffId;
  if (!accountId) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  let email: string;
  let role: StaffRole | undefined;
  if (expectedType === 'staff') {
    const staff = await authRepository.findStaffById(accountId);
    if (!staff || !staff.isActive) {
      throw new UnauthorizedError('Invalid refresh token');
    }
    email = staff.email;
    role = staff.role;
  } else {
    const user = await authRepository.findUserById(accountId);
    if (!user || user.deletedAt) {
      throw new UnauthorizedError('Invalid refresh token');
    }
    email = user.email;
  }

  const tokens = await issueTokenPair({ sub: accountId, type: expectedType, email, role }, context);
  await authRepository.revokeRefreshToken(row.id, hashRefreshToken(tokens.refreshToken));

  return tokens;
}

export function refreshCustomerSession(
  rawToken: string,
  context: RequestContext,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  return rotateRefreshToken(rawToken, 'customer', context);
}

export function refreshStaffSession(
  rawToken: string,
  context: RequestContext,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  return rotateRefreshToken(rawToken, 'staff', context);
}

async function revokeIfActive(rawToken: string, expectedType: AccountType): Promise<void> {
  const tokenHash = hashRefreshToken(rawToken);
  const row = await authRepository.findRefreshTokenByHash(tokenHash);
  if (row && row.tokenType === expectedType && !row.revokedAt) {
    await authRepository.revokeRefreshToken(row.id);
  }
}

export function logoutCustomer(rawToken: string): Promise<void> {
  return revokeIfActive(rawToken, 'customer');
}

export function logoutStaff(rawToken: string): Promise<void> {
  return revokeIfActive(rawToken, 'staff');
}
