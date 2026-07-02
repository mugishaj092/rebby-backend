# Spec 06 — Categories

**Phase:** 2 — Catalog
**Depends on:** Spec 05 (Auth Integration)
**Blocks:** Spec 07 (Products & Variants reference `categoryId`), Spec 09 (public listing by category)

---

## Objective

Build the `catalog` feature's first slice: the `Category` model (self-referencing for nesting), staff-only write endpoints, and public read endpoints. This spec establishes the `features/catalog/` folder that Specs 07–09 will extend.

---

## Context

Read `references/folder-structure.md` (feature layering) and `references/access-levels.md` (public vs staff routes) before starting. Read the `Category` block in `docs/schema.prisma`.

---

## Requirements

### 1. `Category` model

Add to `prisma/schema.prisma`, matching `docs/schema.prisma`:

```prisma
model Category {
  id        String    @id @default(uuid())
  parentId  String?   @map("parent_id")
  name      String    @db.VarChar(150)
  slug      String    @unique @db.VarChar(150)
  imageUrl  String?   @map("image_url") @db.VarChar(500)
  sortOrder Int       @default(0) @map("sort_order")
  isActive  Boolean   @default(true) @map("is_active")
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  parent   Category?  @relation("CategoryTree", fields: [parentId], references: [id], onDelete: SetNull)
  children Category[] @relation("CategoryTree")

  @@index([parentId])
  @@map("categories")
}
```

Note: the `products Product[]` relation shown in the full schema is added in Spec 07, when `Product` is created — don't add it here (dangling reference).

Run `prisma migrate dev --name add_categories`.

### 2. `features/catalog/` — feature scaffold

Create the feature folder for the first time in this spec: `routes.ts`, `controller.ts`, `service.ts`, `repository.ts`, `schema.ts`. Later specs (07, 08, 09) add to these same files rather than creating parallel ones — keep `catalog` as one feature per `architecture.md`, not split per model.

### 3. Repository — `features/catalog/repository.ts`

- `createCategory(input)`
- `updateCategory(id, input)`
- `deleteCategory(id)` — hard delete is acceptable for categories with no products attached; reassign or block deletion if children/products reference it (see Requirement 5).
- `findCategoryById(id)`
- `listCategories({ parentId?, activeOnly? })` — supports fetching top-level (`parentId: null`) or a specific level's children.
- `listCategoryTree()` — returns the full nested tree for admin/home-screen use (recursive query or fetch-all-then-build-in-memory; either is fine for this data size).

### 4. Service — `features/catalog/service.ts`

- `createCategory(staffId, input)` — validates `parentId` (if provided) exists and is itself active; generates `slug` from `name` if not explicitly provided (slugify, ensure uniqueness — append a suffix on collision).
- `updateCategory(staffId, id, input)` — a category cannot be set as its own ancestor (cycle check) if `parentId` is being changed.
- `deleteCategory(staffId, id)` — throw `ConflictError` if the category has active children or active products still assigned (see Requirement 5); this spec doesn't need cascading logic, just a clean rejection.
- `getCategory(id)`, `listCategories(...)`, `getCategoryTree()` — public reads, no staff check.

### 5. Deletion guard (temporary, until Spec 07 exists)

At this point in the build, no `Product` model exists yet, so `deleteCategory` cannot yet check for attached products — implement the child-category check only for now. Add a `// TODO(spec 07): also block deletion if active products reference this category` marker, and revisit this exact function when Spec 07 lands.

### 6. Routes — `features/catalog/routes.ts`

```
GET    /api/v1/categories              public   — listCategories (flat, filterable by parentId)
GET    /api/v1/categories/tree         public   — full nested tree
GET    /api/v1/categories/:id          public   — single category
POST   /api/v1/admin/categories        staff (STAFF+)  — create
PATCH  /api/v1/admin/categories/:id    staff (STAFF+)  — update
DELETE /api/v1/admin/categories/:id    staff (MANAGER+) — delete
```

Note the split: reads live under `/api/v1/categories`, writes under `/api/v1/admin/categories` — matching `architecture.md`'s rule that customer and admin routes are never mixed in one router. Deletion requires a higher role than create/update since it's more destructive.

### 7. Schema — `features/catalog/schema.ts`

- `createCategorySchema`: `name` (required, 1–150 chars), `slug` (optional, validated slug format if provided), `parentId` (optional uuid), `imageUrl` (optional url), `sortOrder` (optional int, default 0).
- `updateCategorySchema`: all fields optional, same validation rules.
- Never accept `id`, `createdAt`, `updatedAt` from the client.

---

## Out of Scope

- Anything involving `Product` (Spec 07).
- Collections/Banners (Spec 08).
- Image upload to Cloudinary — `imageUrl` is accepted as a plain string for now; the upload flow itself is not part of this spec.

---

## Acceptance Criteria

- [ ] A staff member can create a top-level category and a nested child category (`parentId` pointing at the first).
- [ ] `GET /api/v1/categories/tree` returns the nesting correctly (child appears under parent).
- [ ] `GET /api/v1/categories` and `GET /api/v1/categories/:id` work with **no** auth header at all.
- [ ] `POST /api/v1/admin/categories` without a staff session returns 401/403; with a valid staff session (`role: staff` or above) it succeeds.
- [ ] `DELETE /api/v1/admin/categories/:id` with a `staff`-role session (below `MANAGER`) is rejected with 403.
- [ ] Setting a category's `parentId` to itself, or to one of its own descendants, is rejected with `ConflictError`.
- [ ] Deleting a category that has active children is rejected with `ConflictError`.
- [ ] Duplicate `slug` is rejected (unique constraint surfaces as a clean `ConflictError`, not a raw Prisma error).

## Test Requirements

- Ownership/access tests: public reads work unauthenticated; writes require staff; delete requires `MANAGER+`.
- Nested category creation + tree retrieval test.
- Cycle-prevention test (self-parent, and grandparent-as-child).
- Slug uniqueness test, including the auto-slugify-with-suffix-on-collision path if implemented.
- Deletion-with-children rejection test.
