import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('createApp CORS origin resolution', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCorsOrigin = process.env.CORS_ORIGIN;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalCorsOrigin === undefined) {
      delete process.env.CORS_ORIGIN;
    } else {
      process.env.CORS_ORIGIN = originalCorsOrigin;
    }
    vi.resetModules();
  });

  it('reflects the request origin back when CORS_ORIGIN is unset in development', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.CORS_ORIGIN;
    vi.resetModules();

    const { createApp } = await import('@/app');
    const app = createApp();

    const res = await request(app).get('/health').set('Origin', 'https://anything.example.com');

    expect(res.headers['access-control-allow-origin']).toBe('https://anything.example.com');
  });

  it('only allows origins present in an explicit, comma-separated CORS_ORIGIN list', async () => {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGIN = 'https://reby.example.com, https://admin.reby.example.com';
    vi.resetModules();

    const { createApp } = await import('@/app');
    const app = createApp();

    const allowed = await request(app)
      .get('/health')
      .set('Origin', 'https://admin.reby.example.com');
    expect(allowed.headers['access-control-allow-origin']).toBe('https://admin.reby.example.com');

    const blocked = await request(app).get('/health').set('Origin', 'https://evil.example.com');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});
