import { afterEach, describe, expect, it, vi } from 'vitest';

describe('features/auth routes NODE_ENV branch', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.resetModules();
  });

  it('does not register debug routes in production', async () => {
    process.env.NODE_ENV = 'production';
    vi.resetModules();

    const { debugRouter } = await import('@/features/auth/routes');

    expect(debugRouter.stack).toHaveLength(0);
    // vi.resetModules() re-triggers a full reinit of the argon2 native addon via this route
    // module's import chain (routes -> controller -> service -> core/security/password), which
    // can occasionally exceed the default 5s timeout under load.
  }, 15000);
});
