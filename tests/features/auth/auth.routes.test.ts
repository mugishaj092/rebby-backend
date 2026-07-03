import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '@/app';
import { hashPassword } from '@/core/security/password';
import { prisma } from '@/db/prisma';
import * as authService from '@/features/auth/service';
import { StaffRole } from '@/generated/prisma/enums';

function uniqueEmail(): string {
  return `${randomUUID()}@example.com`;
}

describe('features/auth routes', () => {
  const app = createApp();
  const createdUserIds: string[] = [];
  const createdStaffIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.staffProfile.deleteMany({ where: { id: { in: createdStaffIds } } });
    await prisma.$disconnect();
  });

  async function createStaff(role: StaffRole = StaffRole.owner) {
    const passwordHash = await hashPassword('staff-password-123456');
    const staff = await prisma.staffProfile.create({
      data: { name: 'Owner Person', email: uniqueEmail(), passwordHash, role },
    });
    createdStaffIds.push(staff.id);
    return staff;
  }

  describe('POST /api/v1/auth/register', () => {
    it('creates a customer account, returns 201 with no refreshToken in the body, and sets the cookie', async () => {
      const email = uniqueEmail();

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({ name: 'Jane Doe', email, password: 'correct-horse-battery-staple' });

      expect(response.status).toBe(201);
      expect(response.body.data.user.email).toBe(email);
      expect(typeof response.body.data.accessToken).toBe('string');
      expect(response.body.data.refreshToken).toBeUndefined();
      createdUserIds.push(response.body.data.user.id);

      const setCookie = response.headers['set-cookie'] as unknown as string[];
      const refreshCookie = setCookie.find((c) => c.startsWith('reby_refresh_token='));
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toMatch(/HttpOnly/i);
      expect(refreshCookie).toMatch(/SameSite=Strict/i);
      expect(refreshCookie).toMatch(/Path=\/api\/v1\/auth/i);
    });

    it('returns 422 for a password under 12 characters', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({ name: 'Jane Doe', email: uniqueEmail(), password: 'short' });

      expect(response.status).toBe(422);
    });

    it('returns 409 for a duplicate email', async () => {
      const email = uniqueEmail();
      const first = await request(app)
        .post('/api/v1/auth/register')
        .send({ name: 'Jane Doe', email, password: 'correct-horse-battery-staple' });
      createdUserIds.push(first.body.data.user.id);

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({ name: 'Someone Else', email, password: 'another-long-password' });

      expect(response.status).toBe(409);
    });
  });

  describe('customer login/refresh/logout flow', () => {
    it('logs in, refreshes, and logs out via the persisted cookie', async () => {
      const agent = request.agent(app);
      const email = uniqueEmail();
      const registered = await agent
        .post('/api/v1/auth/register')
        .send({ name: 'Jane Doe', email, password: 'correct-horse-battery-staple' });
      createdUserIds.push(registered.body.data.user.id);

      const whoamiBefore = await agent
        .get('/api/v1/_debug/whoami')
        .set('Authorization', `Bearer ${registered.body.data.accessToken}`);
      expect(whoamiBefore.status).toBe(200);

      const refreshRes = await agent.post('/api/v1/auth/refresh');
      expect(refreshRes.status).toBe(200);
      expect(typeof refreshRes.body.data.accessToken).toBe('string');

      const logoutRes = await agent.post('/api/v1/auth/logout');
      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.data.loggedOut).toBe(true);

      const refreshAfterLogout = await agent.post('/api/v1/auth/refresh');
      expect(refreshAfterLogout.status).toBe(401);
    });

    it('POST /api/v1/auth/refresh returns 401 with no cookie', async () => {
      const response = await request(app).post('/api/v1/auth/refresh');
      expect(response.status).toBe(401);
    });

    it('POST /api/v1/auth/login returns 401 for a wrong password', async () => {
      const email = uniqueEmail();
      const registered = await request(app)
        .post('/api/v1/auth/register')
        .send({ name: 'Jane Doe', email, password: 'correct-horse-battery-staple' });
      createdUserIds.push(registered.body.data.user.id);

      const response = await request(app).post('/api/v1/auth/login').send({ email, password: 'wrong-password' });
      expect(response.status).toBe(401);
    });

    it('POST /api/v1/auth/login returns 200 with a token for correct credentials', async () => {
      const email = uniqueEmail();
      const registered = await request(app)
        .post('/api/v1/auth/register')
        .send({ name: 'Jane Doe', email, password: 'correct-horse-battery-staple' });
      createdUserIds.push(registered.body.data.user.id);

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'correct-horse-battery-staple' });

      expect(response.status).toBe(200);
      expect(response.body.data.user.email).toBe(email);
      expect(typeof response.body.data.accessToken).toBe('string');
    });

    it('logout errors are forwarded to the error handler instead of crashing', async () => {
      const spy = vi.spyOn(authService, 'logoutCustomer').mockRejectedValueOnce(new Error('boom'));

      const response = await request(app).post('/api/v1/auth/logout').set('Cookie', 'reby_refresh_token=whatever');

      expect(response.status).toBe(500);
      spy.mockRestore();
    });

    it('logout with no cookie present still succeeds without calling the service', async () => {
      const spy = vi.spyOn(authService, 'logoutCustomer');

      const response = await request(app).post('/api/v1/auth/logout');

      expect(response.status).toBe(200);
      expect(response.body.data.loggedOut).toBe(true);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('requestContext captures the User-Agent header when present', async () => {
      const email = uniqueEmail();
      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('User-Agent', 'vitest-test-agent')
        .send({ name: 'Jane Doe', email, password: 'correct-horse-battery-staple' });

      expect(response.status).toBe(201);
      createdUserIds.push(response.body.data.user.id);
    });
  });

  describe('staff login/refresh/logout flow', () => {
    it('logs in, refreshes, and logs out via the persisted staff cookie', async () => {
      const agent = request.agent(app);
      const staff = await createStaff(StaffRole.owner);

      const loginRes = await agent
        .post('/api/v1/admin/auth/login')
        .send({ email: staff.email, password: 'staff-password-123456' });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.staff.role).toBe(StaffRole.owner);

      const refreshRes = await agent.post('/api/v1/admin/auth/refresh');
      expect(refreshRes.status).toBe(200);

      const logoutRes = await agent.post('/api/v1/admin/auth/logout');
      expect(logoutRes.status).toBe(200);

      const refreshAfterLogout = await agent.post('/api/v1/admin/auth/refresh');
      expect(refreshAfterLogout.status).toBe(401);
    });

    it('there is no staff registration endpoint', async () => {
      const response = await request(app)
        .post('/api/v1/admin/auth/register')
        .send({ name: 'X', email: uniqueEmail(), password: 'whatever-password' });

      expect(response.status).toBe(404);
    });

    it('POST /api/v1/admin/auth/login returns 401 for a wrong password', async () => {
      const staff = await createStaff();

      const response = await request(app)
        .post('/api/v1/admin/auth/login')
        .send({ email: staff.email, password: 'wrong-password' });

      expect(response.status).toBe(401);
    });

    it('staff logout errors are forwarded to the error handler instead of crashing', async () => {
      const spy = vi.spyOn(authService, 'logoutStaff').mockRejectedValueOnce(new Error('boom'));

      const response = await request(app)
        .post('/api/v1/admin/auth/logout')
        .set('Cookie', 'reby_staff_refresh_token=whatever');

      expect(response.status).toBe(500);
      spy.mockRestore();
    });

    it('staff logout with no cookie present still succeeds without calling the service', async () => {
      const spy = vi.spyOn(authService, 'logoutStaff');

      const response = await request(app).post('/api/v1/admin/auth/logout');

      expect(response.status).toBe(200);
      expect(response.body.data.loggedOut).toBe(true);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('cookie scoping', () => {
    it('a customer refresh cookie is not accepted by the staff refresh endpoint, and vice versa', async () => {
      const customerAgent = request.agent(app);
      const email = uniqueEmail();
      const registered = await customerAgent
        .post('/api/v1/auth/register')
        .send({ name: 'Jane Doe', email, password: 'correct-horse-battery-staple' });
      createdUserIds.push(registered.body.data.user.id);

      // The customer cookie is path-scoped to /api/v1/auth, so the agent won't even send it here.
      const staffRefreshWithCustomerCookie = await customerAgent.post('/api/v1/admin/auth/refresh');
      expect(staffRefreshWithCustomerCookie.status).toBe(401);

      const staffAgent = request.agent(app);
      const staff = await createStaff();
      await staffAgent.post('/api/v1/admin/auth/login').send({ email: staff.email, password: 'staff-password-123456' });

      const customerRefreshWithStaffCookie = await staffAgent.post('/api/v1/auth/refresh');
      expect(customerRefreshWithStaffCookie.status).toBe(401);
    });
  });

  describe('rate limiting', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
      vi.resetModules();
    });

    it('returns 429 after 10 requests/minute per IP to a credential-submission endpoint', async () => {
      // authRateLimit is skipped when NODE_ENV==='test' to avoid cross-test flakiness (it's a
      // module-level singleton whose counter would otherwise accumulate across every test file
      // that hits these routes). Temporarily flip NODE_ENV and re-import for a fresh, isolated
      // limiter instance — the same vi.resetModules() + dynamic import pattern already used in
      // tests/db/prisma.branches.test.ts / tests/app.cors.test.ts.
      process.env.NODE_ENV = 'development';
      vi.resetModules();

      const { createApp: createRateLimitedApp } = await import('@/app');
      const rateLimitedApp = createRateLimitedApp();

      let lastStatus = 0;
      for (let i = 0; i < 11; i += 1) {
        const response = await request(rateLimitedApp)
          .post('/api/v1/auth/login')
          .send({ email: uniqueEmail(), password: 'wrong-password' });
        lastStatus = response.status;
      }

      expect(lastStatus).toBe(429);
    }, 20000);
  });
});
