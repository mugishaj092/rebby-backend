# Spec 08 — Collections & Banners

**Phase:** 2 — Catalog
**Depends on:** Spec 07 (Products & Variants)
**Blocks:** Spec 09 (public listing by collection), home-screen sections generally

---

## Objective

Add `Collection` (a curated, ordered set of products — e.g. "New Arrivals," "Flash Deals") and `Banner` (homepage/campaign promotional images with an active date range) to the schema, with staff CRUD and public read endpoints.

---

## Context

Read the `Collection`, `CollectionProduct`, `Banner` blocks in `docs/schema.prisma`. These power the home-screen sections described in `docs/project-overview.md` (Hero banners, New Collection, Flash Deals, etc.).

---

## Requirements

### 1. Schema additions

```prisma
model Collection {
  id        String    @id @default(uuid())
  name      String    @db.VarChar(150)
  slug      String    @unique @db.VarChar(150)
  description String? @db.VarChar(500)
  isActive  Boolean   @default(true) @map("is_active")
  startsAt  DateTime? @map("starts_at") @db.Timestamptz(6)
  endsAt    DateTime? @map("ends_at") @db.Timestamptz(6)
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  products CollectionProduct[]

  @@map("collections")
}

model CollectionProduct {
  collectionId String @map("collection_id")
  productId    String @map("product_id")
  sortOrder    Int    @default(0) @map("sort_order")

  collection Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  product    Product    @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@id([collectionId, productId])
  @@map("collection_products")
}

model Banner {
  id        String    @id @default(uuid())
  title     String    @db.VarChar(191)
  imageUrl  String    @map("image_url") @db.VarChar(500)
  linkType  String    @map("link_type") @db.VarChar(30)
  linkValue String    @map("link_value") @db.VarChar(500)
  placement String    @db.VarChar(30)
  sortOrder Int       @default(0) @map("sort_order")
  isActive  Boolean   @default(true) @map("is_active")
  startsAt  DateTime? @map("starts_at") @db.Timestamptz(6)
  endsAt    DateTime? @map("ends_at") @db.Timestamptz(6)
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([placement, isActive])
  @@map("banners")
}
```

Also add `collections CollectionProduct[]` to the `Product` model from Spec 07 (deferred relation).

`linkType` is validated at the application layer (Zod enum: `"product" | "category" | "collection" | "url"`), not a Postgres enum — it's a light, UI-driven field that may grow without needing a migration each time. `linkValue` holds the id or URL depending on `linkType`; the service validates it resolves to a real entity when `linkType` isn't `"url"`.

Run `prisma migrate dev --name add_collections_and_banners`.

### 2. Repository — extend `features/catalog/repository.ts`

- `createCollection(input)`, `updateCollection(id, input)`, `deleteCollection(id)`.
- `setCollectionProducts(collectionId, productIds[])` — replaces the full set of products in one call (delete-then-insert inside a transaction, or diff-and-apply — either is fine, but it must be atomic).
- `listActiveCollections()` — `isActive: true` AND (`startsAt` is null or in the past) AND (`endsAt` is null or in the future).
- `createBanner(input)`, `updateBanner(id, input)`, `deleteBanner(id)`.
- `listActiveBanners(placement?)` — same active-window logic as collections, optionally filtered by `placement`.

### 3. Service — extend `features/catalog/service.ts`

- `createCollection(staffId, input)` — creates the collection and its initial product set (if provided) in one transaction via `setCollectionProducts`.
- `updateCollectionProducts(staffId, collectionId, productIds[])` — validates every id in `productIds` refers to an active, non-deleted `Product` before applying.
- `createBanner(staffId, input)` — validates `endsAt > startsAt` if both provided; validates `linkValue` resolves to a real product/category/collection when `linkType` requires it.
- `getHomeSections()` — the one function Spec 09 (and the mobile app) actually calls for the home screen: returns active banners grouped by `placement`, and active collections with their product sets, in one shaped response. This is the single "home screen" read path — don't scatter equivalent logic elsewhere.

### 4. Routes — extend `features/catalog/routes.ts`

```
GET    /api/v1/home                          public   — getHomeSections()
GET    /api/v1/collections                   public   — listActiveCollections
GET    /api/v1/collections/:slug             public   — single collection with products
POST   /api/v1/admin/collections             staff (STAFF+)
PATCH  /api/v1/admin/collections/:id         staff (STAFF+)
PUT    /api/v1/admin/collections/:id/products staff (STAFF+)  — replace product set
DELETE /api/v1/admin/collections/:id         staff (MANAGER+)
POST   /api/v1/admin/banners                 staff (STAFF+)
PATCH  /api/v1/admin/banners/:id             staff (STAFF+)
DELETE /api/v1/admin/banners/:id             staff (MANAGER+)
```

### 5. Schema — extend `features/catalog/schema.ts`

- `createCollectionSchema`: `name`, `slug?`, `description?`, `startsAt?`, `endsAt?`, `productIds?: string[]`.
- `setCollectionProductsSchema`: `productIds: string[]` (min 0 — an empty array is valid, meaning "clear the collection").
- `createBannerSchema`: `title`, `imageUrl`, `linkType` (enum), `linkValue`, `placement` (enum: `"homepage" | "campaign"`), `sortOrder?`, `startsAt?`, `endsAt?`. Refine: `endsAt` must be after `startsAt` when both are present.

---

## Out of Scope

- Public product listing filtered by collection at the product-listing level with pagination — that's Spec 09's `list by category/collection` endpoint; this spec only exposes the collection's own detail view.
- Cloudinary upload for `Banner.imageUrl` — accepted as a hosted URL string.

---

## Acceptance Criteria

- [ ] A collection can be created with an initial product set, and products can later be fully replaced via the `PUT .../products` endpoint.
- [ ] `GET /api/v1/collections` returns only active collections within their active window (a collection with `startsAt` in the future is excluded).
- [ ] `GET /api/v1/home` returns banners grouped correctly by `placement` and only includes active, in-window banners.
- [ ] A banner with `endsAt` before `startsAt` is rejected at creation.
- [ ] A banner with `linkType: "product"` and a `linkValue` that doesn't match any real product is rejected.
- [ ] All read endpoints work unauthenticated; all write endpoints require staff; delete requires `MANAGER+`.

## Test Requirements

- Collection product-set replacement test: create with 3 products, replace with a different 2, confirm the join table reflects exactly the new set (no leftover rows).
- Active-window filtering tests for both collections and banners (future-start excluded, past-end excluded, no-dates-set included, currently-active included).
- Banner `linkType`/`linkValue` validation test for each `linkType` value.
- `getHomeSections()` shape test — confirms banners and collections come back grouped/structured as the home screen expects.
