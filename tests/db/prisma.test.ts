import { afterAll, describe, expect, it } from 'vitest';

import { prisma } from '@/db/prisma';

describe('prisma connectivity', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('connects to the database and runs a trivial query', async () => {
    const rows = await prisma.$queryRaw<Array<{ result: number }>>`SELECT 1 AS result`;

    expect(rows[0]?.result).toBe(1);
  });
});
