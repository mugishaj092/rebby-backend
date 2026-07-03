import { prisma } from '@/db/prisma';
import type { AccountType } from '@/core/security/jwt';

export const authRepository = {
  findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  findUserById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  findStaffByEmail(email: string) {
    return prisma.staffProfile.findUnique({ where: { email } });
  },

  findStaffById(id: string) {
    return prisma.staffProfile.findUnique({ where: { id } });
  },

  createUser(data: { name: string; email: string; passwordHash: string; phone: string | null }) {
    return prisma.user.create({ data });
  },

  async incrementUserFailedAttempts(id: string): Promise<number> {
    const updated = await prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });
    return updated.failedLoginAttempts;
  },

  lockUser(id: string, lockedUntil: Date) {
    return prisma.user.update({ where: { id }, data: { lockedUntil } });
  },

  resetUserLoginState(id: string) {
    return prisma.user.update({ where: { id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
  },

  async incrementStaffFailedAttempts(id: string): Promise<number> {
    const updated = await prisma.staffProfile.update({
      where: { id },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });
    return updated.failedLoginAttempts;
  },

  lockStaff(id: string, lockedUntil: Date) {
    return prisma.staffProfile.update({ where: { id }, data: { lockedUntil } });
  },

  resetStaffLoginState(id: string) {
    return prisma.staffProfile.update({ where: { id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
  },

  createRefreshToken(data: {
    tokenHash: string;
    tokenType: AccountType;
    userId: string | null;
    staffId: string | null;
    expiresAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
  }) {
    return prisma.refreshToken.create({ data });
  },

  findRefreshTokenByHash(tokenHash: string) {
    return prisma.refreshToken.findUnique({ where: { tokenHash } });
  },

  revokeRefreshToken(id: string, replacedByTokenHash: string | null = null) {
    return prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date(), replacedByTokenHash },
    });
  },

  revokeAllActiveRefreshTokensForUser(userId: string) {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  revokeAllActiveRefreshTokensForStaff(staffId: string) {
    return prisma.refreshToken.updateMany({
      where: { staffId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
