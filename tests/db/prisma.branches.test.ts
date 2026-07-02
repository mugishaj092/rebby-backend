import { afterEach, describe, expect, it, vi } from 'vitest';

describe('prisma singleton NODE_ENV branches', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.resetModules();
  });

  it('caches the client on globalThis outside production', async () => {
    process.env.NODE_ENV = 'development';
    vi.resetModules();

    const globalForPrisma = globalThis as unknown as { prisma: unknown };
    delete globalForPrisma.prisma;

    const { prisma } = await import('@/db/prisma');

    expect(globalForPrisma.prisma).toBe(prisma);

    await prisma.$disconnect();
  });

  it('does not cache the client on globalThis in production', async () => {
    process.env.NODE_ENV = 'production';
    vi.resetModules();

    const globalForPrisma = globalThis as unknown as { prisma: unknown };
    delete globalForPrisma.prisma;

    const { prisma } = await import('@/db/prisma');

    expect(globalForPrisma.prisma).toBeUndefined();

    await prisma.$disconnect();
  });
});
