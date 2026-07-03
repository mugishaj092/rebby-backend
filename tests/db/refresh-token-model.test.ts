import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { hashPassword } from '@/core/security/password';
import { prisma } from '@/db/prisma';

describe('RefreshToken model', () => {
  const createdUserIds: string[] = [];
  const createdStaffIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.staffProfile.deleteMany({ where: { id: { in: createdStaffIds } } });
    await prisma.$disconnect();
  });

  async function createUser() {
    const user = await prisma.user.create({
      data: { name: 'Jane Doe', email: `${randomUUID()}@example.com`, passwordHash: await hashPassword('password-123456') },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function createStaff() {
    const staff = await prisma.staffProfile.create({
      data: { name: 'Staff Person', email: `${randomUUID()}@example.com`, passwordHash: await hashPassword('password-123456') },
    });
    createdStaffIds.push(staff.id);
    return staff;
  }

  it('allows a row with exactly userId set', async () => {
    const user = await createUser();

    await expect(
      prisma.refreshToken.create({
        data: {
          tokenHash: randomUUID(),
          tokenType: 'customer',
          userId: user.id,
          staffId: null,
          expiresAt: new Date(Date.now() + 1000 * 60),
          ipAddress: null,
          userAgent: null,
        },
      }),
    ).resolves.toMatchObject({ userId: user.id, staffId: null });
  });

  it('rejects a row with neither userId nor staffId set (DB CHECK constraint)', async () => {
    await expect(
      prisma.refreshToken.create({
        data: {
          tokenHash: randomUUID(),
          tokenType: 'customer',
          userId: null,
          staffId: null,
          expiresAt: new Date(Date.now() + 1000 * 60),
          ipAddress: null,
          userAgent: null,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a row with both userId and staffId set, even when both reference real rows (DB CHECK constraint)', async () => {
    const user = await createUser();
    const staff = await createStaff();

    await expect(
      prisma.refreshToken.create({
        data: {
          tokenHash: randomUUID(),
          tokenType: 'customer',
          userId: user.id,
          staffId: staff.id,
          expiresAt: new Date(Date.now() + 1000 * 60),
          ipAddress: null,
          userAgent: null,
        },
      }),
    ).rejects.toThrow();
  });
});
