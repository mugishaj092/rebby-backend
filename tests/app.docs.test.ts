import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '@/app';

describe('dev-only API docs', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.resetModules();
  });

  it('is not mounted in production', async () => {
    process.env.NODE_ENV = 'production';
    vi.resetModules();

    const { createApp: createProdApp } = await import('@/app');
    const app = createProdApp();

    const response = await request(app).get('/api-docs.json');

    expect(response.status).toBe(404);
  });

  it('GET /api-docs.json returns the OpenAPI document', async () => {
    const app = createApp();

    const response = await request(app).get('/api-docs.json');

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.0.3');
    expect(Object.keys(response.body.paths)).toContain('/api/v1/auth/register');
  });

  it('GET /api-docs serves the Swagger UI page', async () => {
    const app = createApp();

    const response = await request(app).get('/api-docs/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('swagger-ui');
  });
});
