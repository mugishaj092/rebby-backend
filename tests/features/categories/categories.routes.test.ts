import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { createApp } from '@/app';
import { signAccessToken } from '@/core/security/jwt';
import { prisma } from '@/db/prisma';
import { categoriesRepository } from '@/features/categories/repository';
import * as categoriesService from '@/features/categories/service';
import { Prisma } from '@/generated/prisma/client';
import { StaffRole } from '@/generated/prisma/enums';

function uniqueSlugConflictError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`slug`)',
    {
      code: 'P2002',
      clientVersion: '7.8.0',
      meta: { target: ['slug'] },
    },
  );
}

function uniqueName(prefix = 'Category'): string {
  return `${prefix} ${randomUUID()}`;
}

function staffToken(role: StaffRole = StaffRole.staff): string {
  return signAccessToken({
    sub: randomUUID(),
    type: 'staff',
    email: `${randomUUID()}@example.com`,
    role,
  });
}

describe('features/categories routes', () => {
  const app = createApp();
  const createdCategoryIds: string[] = [];

  afterAll(async () => {
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.$disconnect();
  });

  async function createCategoryViaApi(
    overrides: Record<string, unknown> = {},
    role: StaffRole = StaffRole.staff,
  ): Promise<request.Response> {
    const response = await request(app)
      .post('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${staffToken(role)}`)
      .send({ name: uniqueName(), ...overrides });

    if (response.status === 201) {
      createdCategoryIds.push(response.body.data.id);
    }
    return response;
  }

  describe('public reads', () => {
    it('GET /api/v1/categories works with no auth header at all', async () => {
      const response = await request(app).get('/api/v1/categories');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('GET /api/v1/categories/tree works with no auth header at all', async () => {
      const response = await request(app).get('/api/v1/categories/tree');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('GET /api/v1/categories/:id works with no auth header at all', async () => {
      const created = await createCategoryViaApi();

      const response = await request(app).get(`/api/v1/categories/${created.body.data.id}`);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(created.body.data.id);
    });

    it('GET /api/v1/categories returns 404 for an unknown id', async () => {
      const response = await request(app).get(`/api/v1/categories/${randomUUID()}`);
      expect(response.status).toBe(404);
    });

    it('GET /api/v1/categories?parentId= scopes to that level, top-level otherwise', async () => {
      const parent = await createCategoryViaApi({ name: uniqueName('LevelParent') });
      const child = await createCategoryViaApi({
        name: uniqueName('LevelChild'),
        parentId: parent.body.data.id,
      });

      const topLevel = await request(app).get('/api/v1/categories');
      const childIds = topLevel.body.data.map((c: { id: string }) => c.id);
      expect(childIds).not.toContain(child.body.data.id);

      const scoped = await request(app).get(`/api/v1/categories?parentId=${parent.body.data.id}`);
      const scopedIds = scoped.body.data.map((c: { id: string }) => c.id);
      expect(scopedIds).toContain(child.body.data.id);
    });
  });

  describe('access control on admin routes', () => {
    it('POST /api/v1/admin/categories without a staff session returns 401', async () => {
      const response = await request(app)
        .post('/api/v1/admin/categories')
        .send({ name: uniqueName() });
      expect(response.status).toBe(401);
    });

    it('POST /api/v1/admin/categories with a valid staff session succeeds', async () => {
      const response = await createCategoryViaApi();
      expect(response.status).toBe(201);
      expect(response.body.data.name).toEqual(expect.any(String));
    });

    it('DELETE /api/v1/admin/categories/:id with a staff-role session (below MANAGER) is rejected with 403', async () => {
      const created = await createCategoryViaApi();

      const response = await request(app)
        .delete(`/api/v1/admin/categories/${created.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken(StaffRole.staff)}`);

      expect(response.status).toBe(403);
    });

    it('DELETE /api/v1/admin/categories/:id with a MANAGER session succeeds', async () => {
      const created = await createCategoryViaApi();

      const response = await request(app)
        .delete(`/api/v1/admin/categories/${created.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken(StaffRole.manager)}`);

      expect(response.status).toBe(200);
    });
  });

  describe('nesting + tree', () => {
    it('creates a top-level and nested child category, reflected correctly in the tree', async () => {
      const parent = await createCategoryViaApi({ name: uniqueName('Parent') });
      const child = await createCategoryViaApi({
        name: uniqueName('Child'),
        parentId: parent.body.data.id,
      });
      expect(child.status).toBe(201);
      expect(child.body.data.parentId).toBe(parent.body.data.id);

      const tree = await request(app).get('/api/v1/categories/tree');
      const parentNode = tree.body.data.find(
        (node: { id: string }) => node.id === parent.body.data.id,
      );

      expect(parentNode).toBeDefined();
      expect(parentNode.children.some((c: { id: string }) => c.id === child.body.data.id)).toBe(
        true,
      );
    });
  });

  describe('cycle prevention', () => {
    it('rejects setting a category as its own parent', async () => {
      const category = await createCategoryViaApi();

      const response = await request(app)
        .patch(`/api/v1/admin/categories/${category.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ parentId: category.body.data.id });

      expect(response.status).toBe(409);
    });

    it('rejects setting a grandparent as a child of its own descendant', async () => {
      const grandparent = await createCategoryViaApi({ name: uniqueName('Grandparent') });
      const parent = await createCategoryViaApi({
        name: uniqueName('Parent'),
        parentId: grandparent.body.data.id,
      });
      const child = await createCategoryViaApi({
        name: uniqueName('Child'),
        parentId: parent.body.data.id,
      });

      const response = await request(app)
        .patch(`/api/v1/admin/categories/${grandparent.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ parentId: child.body.data.id });

      expect(response.status).toBe(409);
    });
  });

  describe('slug uniqueness', () => {
    it('rejects an explicit duplicate slug with a clean ConflictError, not a raw Prisma error', async () => {
      const slug = `duplicate-slug-${randomUUID()}`;
      const first = await createCategoryViaApi({ slug });
      expect(first.status).toBe(201);

      const response = await createCategoryViaApi({ slug });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('auto-slugifies from name and appends a suffix on collision', async () => {
      const name = `Collision Name ${randomUUID()}`;
      const first = await createCategoryViaApi({ name });
      const second = await createCategoryViaApi({ name });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.data.slug).not.toBe(first.body.data.slug);
      expect(second.body.data.slug.startsWith(first.body.data.slug)).toBe(true);
    });
  });

  describe('deletion guard', () => {
    it('rejects deleting a category that has active children', async () => {
      const parent = await createCategoryViaApi({ name: uniqueName('ParentWithChild') });
      await createCategoryViaApi({ name: uniqueName('Child'), parentId: parent.body.data.id });

      const response = await request(app)
        .delete(`/api/v1/admin/categories/${parent.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken(StaffRole.manager)}`);

      expect(response.status).toBe(409);
    });

    it('returns 404 when deleting a category that does not exist', async () => {
      const response = await request(app)
        .delete(`/api/v1/admin/categories/${randomUUID()}`)
        .set('Authorization', `Bearer ${staffToken(StaffRole.manager)}`);

      expect(response.status).toBe(404);
    });
  });

  describe('update', () => {
    it('updates a category and returns 200 with the updated fields', async () => {
      const created = await createCategoryViaApi();
      const newSlug = `updated-slug-${randomUUID()}`;

      const response = await request(app)
        .patch(`/api/v1/admin/categories/${created.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ name: 'Updated Name', slug: newSlug });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe('Updated Name');
      expect(response.body.data.slug).toBe(newSlug);
    });

    it('returns 404 when updating a category that does not exist', async () => {
      const response = await request(app)
        .patch(`/api/v1/admin/categories/${randomUUID()}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ name: 'Does Not Matter' });

      expect(response.status).toBe(404);
    });

    it('updates imageUrl and sortOrder independently of name/slug', async () => {
      const created = await createCategoryViaApi();

      const response = await request(app)
        .patch(`/api/v1/admin/categories/${created.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ imageUrl: 'https://example.com/image.png', sortOrder: 5 });

      expect(response.status).toBe(200);
      expect(response.body.data.imageUrl).toBe('https://example.com/image.png');
      expect(response.body.data.sortOrder).toBe(5);
    });
  });

  describe('parent validation', () => {
    it('rejects creating a category under a parentId that does not exist', async () => {
      const response = await createCategoryViaApi({ parentId: randomUUID() });
      expect(response.status).toBe(404);
    });

    it('rejects creating a category under a parent that has been deactivated', async () => {
      const parent = await createCategoryViaApi({ name: uniqueName('DeactivatedParent') });
      await prisma.category.update({
        where: { id: parent.body.data.id },
        data: { isActive: false },
      });

      const response = await createCategoryViaApi({ parentId: parent.body.data.id });

      expect(response.status).toBe(404);
    });
  });

  describe('query filters', () => {
    it('excludes inactive categories by default, with no activeOnly param at all', async () => {
      const hidden = await createCategoryViaApi({ name: uniqueName('HiddenByDefault') });
      await prisma.category.update({
        where: { id: hidden.body.data.id },
        data: { isActive: false },
      });

      const response = await request(app).get('/api/v1/categories');
      const ids = response.body.data.map((c: { id: string }) => c.id);

      expect(response.status).toBe(200);
      expect(ids).not.toContain(hidden.body.data.id);
    });

    it('activeOnly=true filters to active categories only', async () => {
      const response = await request(app).get('/api/v1/categories?activeOnly=true');
      expect(response.status).toBe(200);
      expect(response.body.data.every((c: { isActive: boolean }) => c.isActive === true)).toBe(
        true,
      );
    });

    it('activeOnly=false lifts the restriction entirely, rather than showing only inactive ones', async () => {
      const hidden = await createCategoryViaApi({ name: uniqueName('VisibleWhenUnrestricted') });
      await prisma.category.update({
        where: { id: hidden.body.data.id },
        data: { isActive: false },
      });

      const response = await request(app).get('/api/v1/categories?activeOnly=false');
      const ids = response.body.data.map((c: { id: string }) => c.id);

      expect(response.status).toBe(200);
      expect(ids).toContain(hidden.body.data.id);
      expect(response.body.data.some((c: { isActive: boolean }) => c.isActive === true)).toBe(true);
    });
  });

  describe('tree visibility of inactive categories', () => {
    it('excludes an inactive category from GET /api/v1/categories/tree by default', async () => {
      const hidden = await createCategoryViaApi({ name: uniqueName('HiddenTreeParent') });
      await prisma.category.update({
        where: { id: hidden.body.data.id },
        data: { isActive: false },
      });

      const response = await request(app).get('/api/v1/categories/tree');
      const ids = response.body.data.map((node: { id: string }) => node.id);

      expect(ids).not.toContain(hidden.body.data.id);
    });

    it('service.getCategoryTree(false) still returns inactive categories for internal/admin callers', async () => {
      const hidden = await createCategoryViaApi({ name: uniqueName('AdminTreeParent') });
      await prisma.category.update({
        where: { id: hidden.body.data.id },
        data: { isActive: false },
      });

      const tree = await categoriesService.getCategoryTree(false);
      const ids = tree.map((node) => node.id);

      expect(ids).toContain(hidden.body.data.id);
    });
  });

  describe('slug collision exhaustion', () => {
    it('rejects with a ConflictError when no unique slug can be generated', async () => {
      const spy = vi
        .spyOn(categoriesRepository, 'findCategoryBySlug')
        .mockResolvedValue({ id: randomUUID() } as never);

      const response = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ name: uniqueName('AlwaysCollides') });

      expect(response.status).toBe(409);
      spy.mockRestore();
    });
  });

  describe('slug uniqueness race guard (TOCTOU between pre-check and write)', () => {
    it('maps a concurrent unique-constraint violation on create to a clean 409, not a raw error', async () => {
      const spy = vi
        .spyOn(categoriesRepository, 'createCategory')
        .mockRejectedValueOnce(uniqueSlugConflictError());

      const response = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ name: uniqueName('RaceCreate') });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
      spy.mockRestore();
    });

    it('maps a concurrent unique-constraint violation on update to a clean 409, not a raw error', async () => {
      const created = await createCategoryViaApi();
      const spy = vi
        .spyOn(categoriesRepository, 'updateCategory')
        .mockRejectedValueOnce(uniqueSlugConflictError());

      const response = await request(app)
        .patch(`/api/v1/admin/categories/${created.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ slug: `race-update-${randomUUID()}` });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
      spy.mockRestore();
    });

    it('rethrows a non-P2002 error from the write instead of swallowing it', async () => {
      const spy = vi
        .spyOn(categoriesRepository, 'createCategory')
        .mockRejectedValueOnce(new Error('unexpected db failure'));

      const response = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ name: uniqueName('RaceOtherError') });

      expect(response.status).toBe(500);
      spy.mockRestore();
    });
  });

  describe('defensive guard against a pre-existing cyclic parent chain', () => {
    it('does not hang and still completes the update when walking an already-corrupted ancestor chain', async () => {
      const a = await createCategoryViaApi({ name: uniqueName('CorruptA') });
      const b = await createCategoryViaApi({
        name: uniqueName('CorruptB'),
        parentId: a.body.data.id,
      });
      // Force a raw two-node cycle (A -> B -> A) that could never be produced through the
      // service's own cycle check — simulates a corrupted/out-of-band DB edit so the
      // visited-set guard in assertNoCycle has real coverage against an infinite loop.
      await prisma.category.update({
        where: { id: a.body.data.id },
        data: { parentId: b.body.data.id },
      });

      const outsider = await createCategoryViaApi({ name: uniqueName('Outsider') });

      const response = await request(app)
        .patch(`/api/v1/admin/categories/${outsider.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ parentId: a.body.data.id });

      expect(response.status).toBe(200);
    });
  });

  describe('repository', () => {
    it('listCategories without a parentId filter returns categories across all levels', async () => {
      const parent = await createCategoryViaApi({ name: uniqueName('RepoParent') });
      const child = await createCategoryViaApi({
        name: uniqueName('RepoChild'),
        parentId: parent.body.data.id,
      });

      const results = await categoriesRepository.listCategories({});
      const ids = results.map((c) => c.id);

      expect(ids).toContain(parent.body.data.id);
      expect(ids).toContain(child.body.data.id);
    });
  });

  describe('race condition guard: ancestor deleted mid-walk', () => {
    it('stops the ancestor walk cleanly if a referenced ancestor vanishes between lookups', async () => {
      const a = await createCategoryViaApi({ name: uniqueName('VanishingA') });
      const b = await createCategoryViaApi({
        name: uniqueName('VanishingB'),
        parentId: a.body.data.id,
      });
      const outsider = await createCategoryViaApi({ name: uniqueName('VanishingOutsider') });

      const spy = vi.spyOn(categoriesRepository, 'findCategoryById').mockImplementation(((
        id: string,
      ) => {
        if (id === a.body.data.id) {
          return Promise.resolve(null);
        }
        return prisma.category.findUnique({ where: { id } });
      }) as never);

      const response = await request(app)
        .patch(`/api/v1/admin/categories/${outsider.body.data.id}`)
        .set('Authorization', `Bearer ${staffToken()}`)
        .send({ parentId: b.body.data.id });

      expect(response.status).toBe(200);
      spy.mockRestore();
    });
  });

  describe('error forwarding', () => {
    it('forwards unexpected listCategories errors to the error handler instead of crashing', async () => {
      const spy = vi
        .spyOn(categoriesService, 'listCategories')
        .mockRejectedValueOnce(new Error('boom'));

      const response = await request(app).get('/api/v1/categories');

      expect(response.status).toBe(500);
      spy.mockRestore();
    });

    it('forwards unexpected getCategoryTree errors to the error handler instead of crashing', async () => {
      const spy = vi
        .spyOn(categoriesService, 'getCategoryTree')
        .mockRejectedValueOnce(new Error('boom'));

      const response = await request(app).get('/api/v1/categories/tree');

      expect(response.status).toBe(500);
      spy.mockRestore();
    });
  });
});
