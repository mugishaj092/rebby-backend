import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { signAccessToken } from '@/core/security/jwt';
import { StaffRole } from '@/generated/prisma/enums';

describe('debug routes (GET /api/v1/_debug/*)', () => {
  const app = createApp();

  it('GET /_debug/whoami returns req.user for a valid customer access token', async () => {
    const token = signAccessToken({ sub: 'user-1', type: 'customer', email: 'jane@example.com' });

    const response = await request(app).get('/api/v1/_debug/whoami').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.user).toEqual({ id: 'user-1', email: 'jane@example.com' });
  });

  it('GET /_debug/whoami returns 401 with no Authorization header', async () => {
    const response = await request(app).get('/api/v1/_debug/whoami');

    expect(response.status).toBe(401);
  });

  it('GET /_debug/staff-whoami returns 403 for a valid customer access token', async () => {
    const token = signAccessToken({ sub: 'user-1', type: 'customer', email: 'jane@example.com' });

    const response = await request(app).get('/api/v1/_debug/staff-whoami').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('GET /_debug/staff-whoami returns req.staff for a valid staff access token (route requires minRole STAFF)', async () => {
    const token = signAccessToken({ sub: 'staff-1', type: 'staff', email: 'staff@example.com', role: StaffRole.staff });

    const response = await request(app).get('/api/v1/_debug/staff-whoami').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.staff).toEqual({ id: 'staff-1', email: 'staff@example.com', role: StaffRole.staff });
  });

  it('GET /_debug/staff-whoami returns 401 with no Authorization header', async () => {
    const response = await request(app).get('/api/v1/_debug/staff-whoami');

    expect(response.status).toBe(401);
  });
});
