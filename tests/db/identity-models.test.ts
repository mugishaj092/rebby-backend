import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { prisma } from '@/db/prisma';

describe('identity models', () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('creates a user and applies schema defaults', async () => {
    const email = `${randomUUID()}@example.com`;

    const created = await prisma.user.create({
      data: { name: 'Jane Doe', email, passwordHash: 'hashed' },
    });
    createdUserIds.push(created.id);

    const found = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });

    expect(found.notificationsEnabled).toBe(true);
    expect(found.deletedAt).toBeNull();
  });

  it('rejects an address referencing a non-existent user', async () => {
    await expect(
      prisma.address.create({
        data: {
          userId: randomUUID(),
          recipientName: 'Jane Doe',
          phone: '0780000000',
          province: 'Kigali',
          district: 'Gasabo',
        },
      }),
    ).rejects.toThrow();
  });

  it('cascades address deletion when the owning user is deleted', async () => {
    const email = `${randomUUID()}@example.com`;

    const user = await prisma.user.create({
      data: { name: 'Cascade Test', email, passwordHash: 'hashed' },
    });

    const address = await prisma.address.create({
      data: {
        userId: user.id,
        recipientName: 'Cascade Test',
        phone: '0780000000',
        province: 'Kigali',
        district: 'Gasabo',
      },
    });

    await prisma.user.delete({ where: { id: user.id } });

    const foundAddress = await prisma.address.findUnique({ where: { id: address.id } });
    expect(foundAddress).toBeNull();
  });
});
