import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '@/app';

describe('GET /health', () => {
  it('returns the ok envelope with HTTP 200', async () => {
    const app = createApp();

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { status: 'ok' } });
  });
});
