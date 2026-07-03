import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { ConflictError, UnauthorizedError } from '@/core/errors/AppError';
import * as passwordModule from '@/core/security/password';
import { verifyPassword } from '@/core/security/password';
import { prisma } from '@/db/prisma';
import * as authService from '@/features/auth/service';
import { StaffRole } from '@/generated/prisma/enums';

const context = { ipAddress: '127.0.0.1', userAgent: 'vitest' };

function uniqueEmail(): string {
  return `${randomUUID()}@example.com`;
}

describe('auth.service', () => {
  const createdUserIds: string[] = [];
  const createdStaffIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.staffProfile.deleteMany({ where: { id: { in: createdStaffIds } } });
    await prisma.$disconnect();
  });

  async function createStaff(role: StaffRole, overrides: { isActive?: boolean } = {}) {
    const passwordHash = await passwordModule.hashPassword('staff-password-123456');
    const staff = await prisma.staffProfile.create({
      data: {
        name: 'Staff Person',
        email: uniqueEmail(),
        passwordHash,
        role,
        isActive: overrides.isActive ?? true,
      },
    });
    createdStaffIds.push(staff.id);
    return staff;
  }

  describe('registerCustomer', () => {
    it('creates a User with an argon2id passwordHash and issues both tokens', async () => {
      const email = uniqueEmail();

      const result = await authService.registerCustomer(
        { name: 'Jane Doe', email, password: 'correct-horse-battery-staple' },
        context,
      );
      createdUserIds.push(result.account.id);

      expect(result.account).toEqual({ id: result.account.id, email, name: 'Jane Doe' });
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.expiresIn).toBeGreaterThan(0);

      const user = await prisma.user.findUniqueOrThrow({ where: { id: result.account.id } });
      expect(user.passwordHash).not.toBe('correct-horse-battery-staple');
      expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
      await expect(verifyPassword(user.passwordHash, 'correct-horse-battery-staple')).resolves.toBe(true);
    });

    it('throws ConflictError for a duplicate email', async () => {
      const email = uniqueEmail();
      const first = await authService.registerCustomer({ name: 'Jane', email, password: 'password-123456' }, context);
      createdUserIds.push(first.account.id);

      await expect(
        authService.registerCustomer({ name: 'Other', email, password: 'password-654321' }, context),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('loginCustomer', () => {
    it('returns tokens for correct credentials', async () => {
      const email = uniqueEmail();
      const registered = await authService.registerCustomer(
        { name: 'Jane Doe', email, password: 'correct-horse-battery-staple' },
        context,
      );
      createdUserIds.push(registered.account.id);

      const result = await authService.loginCustomer({ email, password: 'correct-horse-battery-staple' }, context);

      expect(result.account.id).toBe(registered.account.id);
      expect(typeof result.accessToken).toBe('string');
    });

    it('throws UnauthorizedError for a wrong password', async () => {
      const email = uniqueEmail();
      const registered = await authService.registerCustomer({ name: 'Jane', email, password: 'password-123456' }, context);
      createdUserIds.push(registered.account.id);

      await expect(authService.loginCustomer({ email, password: 'wrong-password-000' }, context)).rejects.toThrow(
        UnauthorizedError,
      );
    });

    it('throws UnauthorizedError for an unknown email, still paying the argon2.verify() cost (timing consistency)', async () => {
      const spy = vi.spyOn(passwordModule, 'verifyPassword');

      await expect(
        authService.loginCustomer({ email: uniqueEmail(), password: 'whatever-password' }, context),
      ).rejects.toThrow(UnauthorizedError);

      expect(spy).toHaveBeenCalledWith(passwordModule.DUMMY_PASSWORD_HASH, 'whatever-password');
      spy.mockRestore();
    });

    it('throws UnauthorizedError for a soft-deleted user', async () => {
      const email = uniqueEmail();
      const registered = await authService.registerCustomer({ name: 'Jane', email, password: 'password-123456' }, context);
      createdUserIds.push(registered.account.id);
      await prisma.user.update({ where: { id: registered.account.id }, data: { deletedAt: new Date() } });

      await expect(authService.loginCustomer({ email, password: 'password-123456' }, context)).rejects.toThrow(
        UnauthorizedError,
      );
    });

    describe('account lockout', () => {
      it('locks the account after 5 consecutive failures, rejects a correct password during the lock window, then succeeds and resets attempts once the lock has passed', async () => {
        // argon2 hashing is deliberately slow; this test performs 8 login attempts.
        const email = uniqueEmail();
        const registered = await authService.registerCustomer(
          { name: 'Jane', email, password: 'correct-password-123' },
          context,
        );
        createdUserIds.push(registered.account.id);

        for (let i = 0; i < 5; i += 1) {
          await expect(authService.loginCustomer({ email, password: 'wrong-password' }, context)).rejects.toThrow(
            UnauthorizedError,
          );
        }

        const lockedUser = await prisma.user.findUniqueOrThrow({ where: { id: registered.account.id } });
        expect(lockedUser.failedLoginAttempts).toBe(5);
        expect(lockedUser.lockedUntil).not.toBeNull();

        // 6th attempt, correct password, still locked — must still fail
        await expect(
          authService.loginCustomer({ email, password: 'correct-password-123' }, context),
        ).rejects.toThrow(UnauthorizedError);

        // Simulate the lock window having passed
        await prisma.user.update({
          where: { id: registered.account.id },
          data: { lockedUntil: new Date(Date.now() - 1000) },
        });

        const result = await authService.loginCustomer({ email, password: 'correct-password-123' }, context);
        expect(result.account.id).toBe(registered.account.id);

        const unlockedUser = await prisma.user.findUniqueOrThrow({ where: { id: registered.account.id } });
        expect(unlockedUser.failedLoginAttempts).toBe(0);
        expect(unlockedUser.lockedUntil).toBeNull();
      }, 20000);
    });
  });

  describe('loginStaff', () => {
    it('returns tokens with the staff role for correct credentials', async () => {
      const staff = await createStaff(StaffRole.manager);

      const result = await authService.loginStaff({ email: staff.email, password: 'staff-password-123456' }, context);

      expect(result.account).toEqual({ id: staff.id, email: staff.email, name: staff.name, role: StaffRole.manager });
    });

    it('throws UnauthorizedError for a wrong password', async () => {
      const staff = await createStaff(StaffRole.staff);

      await expect(
        authService.loginStaff({ email: staff.email, password: 'wrong-password' }, context),
      ).rejects.toThrow(UnauthorizedError);
    });

    it('throws UnauthorizedError for an inactive staff profile', async () => {
      const staff = await createStaff(StaffRole.staff, { isActive: false });

      await expect(
        authService.loginStaff({ email: staff.email, password: 'staff-password-123456' }, context),
      ).rejects.toThrow(UnauthorizedError);
    });

    it('locks a staff account after 5 consecutive failures, rejecting a correct password during the lock window', async () => {
      const staff = await createStaff(StaffRole.staff);

      for (let i = 0; i < 5; i += 1) {
        await expect(
          authService.loginStaff({ email: staff.email, password: 'wrong-password' }, context),
        ).rejects.toThrow(UnauthorizedError);
      }

      const locked = await prisma.staffProfile.findUniqueOrThrow({ where: { id: staff.id } });
      expect(locked.failedLoginAttempts).toBe(5);
      expect(locked.lockedUntil).not.toBeNull();

      await expect(
        authService.loginStaff({ email: staff.email, password: 'staff-password-123456' }, context),
      ).rejects.toThrow(UnauthorizedError);
    }, 20000);
  });

  describe('refresh rotation', () => {
    it('rotates the refresh token, and the new one can be used to rotate again', async () => {
      const email = uniqueEmail();
      const registered = await authService.registerCustomer({ name: 'Jane', email, password: 'password-123456' }, context);
      createdUserIds.push(registered.account.id);

      const rotated = await authService.refreshCustomerSession(registered.refreshToken, context);
      expect(typeof rotated.accessToken).toBe('string');
      expect(rotated.refreshToken).not.toBe(registered.refreshToken);

      const rotatedAgain = await authService.refreshCustomerSession(rotated.refreshToken, context);
      expect(typeof rotatedAgain.accessToken).toBe('string');
      expect(rotatedAgain.refreshToken).not.toBe(rotated.refreshToken);
    });

    it('rejects a replayed (already-rotated) refresh token', async () => {
      const email = uniqueEmail();
      const registered = await authService.registerCustomer({ name: 'Jane', email, password: 'password-123456' }, context);
      createdUserIds.push(registered.account.id);

      await authService.refreshCustomerSession(registered.refreshToken, context);

      await expect(authService.refreshCustomerSession(registered.refreshToken, context)).rejects.toThrow(
        UnauthorizedError,
      );
    });

    it('rejects an unknown refresh token', async () => {
      await expect(authService.refreshCustomerSession('not-a-real-token', context)).rejects.toThrow(
        UnauthorizedError,
      );
    });

    it('rejects a refresh token past its absolute expiresAt, without silently renewing it', async () => {
      const email = uniqueEmail();
      const registered = await authService.registerCustomer({ name: 'Jane', email, password: 'password-123456' }, context);
      createdUserIds.push(registered.account.id);

      const { hashRefreshToken } = await import('@/core/security/jwt');
      await prisma.refreshToken.update({
        where: { tokenHash: hashRefreshToken(registered.refreshToken) },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await expect(authService.refreshCustomerSession(registered.refreshToken, context)).rejects.toThrow(
        UnauthorizedError,
      );
    });

    it('rejects a customer refresh token presented to the staff refresh flow and vice versa', async () => {
      const email = uniqueEmail();
      const registered = await authService.registerCustomer({ name: 'Jane', email, password: 'password-123456' }, context);
      createdUserIds.push(registered.account.id);

      const staff = await createStaff(StaffRole.staff);
      const staffLogin = await authService.loginStaff({ email: staff.email, password: 'staff-password-123456' }, context);

      await expect(authService.refreshStaffSession(registered.refreshToken, context)).rejects.toThrow(
        UnauthorizedError,
      );
      await expect(authService.refreshCustomerSession(staffLogin.refreshToken, context)).rejects.toThrow(
        UnauthorizedError,
      );
    });

    it('[reuse detection — the core security guarantee of this spec] replaying an already-rotated token revokes the whole family: both the replay and the next legitimate token are rejected', async () => {
      const email = uniqueEmail();
      const registered = await authService.registerCustomer({ name: 'Jane', email, password: 'password-123456' }, context);
      createdUserIds.push(registered.account.id);

      const tokenA = registered.refreshToken;
      const rotatedToB = await authService.refreshCustomerSession(tokenA, context);
      const tokenB = rotatedToB.refreshToken;

      // Replay the already-rotated token A — should be rejected AND should revoke the family.
      await expect(authService.refreshCustomerSession(tokenA, context)).rejects.toThrow(UnauthorizedError);

      // Token B, the legitimate next token in the chain, must now also be rejected.
      await expect(authService.refreshCustomerSession(tokenB, context)).rejects.toThrow(UnauthorizedError);
    });

    it('reuse detection also revokes the whole family for the staff flow', async () => {
      const staff = await createStaff(StaffRole.staff);
      const staffLogin = await authService.loginStaff({ email: staff.email, password: 'staff-password-123456' }, context);

      const tokenA = staffLogin.refreshToken;
      const rotatedToB = await authService.refreshStaffSession(tokenA, context);
      const tokenB = rotatedToB.refreshToken;

      await expect(authService.refreshStaffSession(tokenA, context)).rejects.toThrow(UnauthorizedError);
      await expect(authService.refreshStaffSession(tokenB, context)).rejects.toThrow(UnauthorizedError);
    });

    it('rejects a refresh for a user soft-deleted after the token was issued', async () => {
      const email = uniqueEmail();
      const registered = await authService.registerCustomer({ name: 'Jane', email, password: 'password-123456' }, context);
      createdUserIds.push(registered.account.id);

      await prisma.user.update({ where: { id: registered.account.id }, data: { deletedAt: new Date() } });

      await expect(authService.refreshCustomerSession(registered.refreshToken, context)).rejects.toThrow(
        UnauthorizedError,
      );
    });

    it('rejects a refresh for a staff account deactivated after the token was issued', async () => {
      const staff = await createStaff(StaffRole.staff);
      const staffLogin = await authService.loginStaff({ email: staff.email, password: 'staff-password-123456' }, context);

      await prisma.staffProfile.update({ where: { id: staff.id }, data: { isActive: false } });

      await expect(authService.refreshStaffSession(staffLogin.refreshToken, context)).rejects.toThrow(
        UnauthorizedError,
      );
    });

    it('rejects a refresh token row with neither userId nor staffId set (defensive — unreachable via the DB CHECK constraint in normal operation)', async () => {
      const { authRepository } = await import('@/features/auth/repository');
      const spy = vi.spyOn(authRepository, 'findRefreshTokenByHash').mockResolvedValueOnce({
        id: 'orphan-row',
        tokenHash: 'irrelevant',
        tokenType: 'customer',
        userId: null,
        staffId: null,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        replacedByTokenHash: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
      });

      await expect(authService.refreshCustomerSession('irrelevant-raw-token', context)).rejects.toThrow(
        UnauthorizedError,
      );

      spy.mockRestore();
    });
  });

  describe('logout', () => {
    it('revokes the refresh token so a subsequent refresh attempt fails', async () => {
      const email = uniqueEmail();
      const registered = await authService.registerCustomer({ name: 'Jane', email, password: 'password-123456' }, context);
      createdUserIds.push(registered.account.id);

      await authService.logoutCustomer(registered.refreshToken);

      await expect(authService.refreshCustomerSession(registered.refreshToken, context)).rejects.toThrow(
        UnauthorizedError,
      );
    });

    it('is a no-op (does not throw) for an unknown token', async () => {
      await expect(authService.logoutCustomer('not-a-real-token')).resolves.toBeUndefined();
    });
  });
});
