import { afterEach, describe, expect, it, vi } from 'vitest';

describe('src/seed/guard assertNotProduction', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.resetModules();
  });

  it('throws when NODE_ENV is production', async () => {
    process.env.NODE_ENV = 'production';
    vi.resetModules();

    const { assertNotProduction } = await import('@/seed/guard');

    expect(assertNotProduction).toThrow(/Refusing to run the dev seed script/);
  });

  it('does not throw when NODE_ENV is development', async () => {
    process.env.NODE_ENV = 'development';
    vi.resetModules();

    const { assertNotProduction } = await import('@/seed/guard');

    expect(assertNotProduction).not.toThrow();
  });

  it('does not throw when NODE_ENV is test', async () => {
    process.env.NODE_ENV = 'test';
    vi.resetModules();

    const { assertNotProduction } = await import('@/seed/guard');

    expect(assertNotProduction).not.toThrow();
  });
});
