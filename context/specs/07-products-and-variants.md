# Spec 07 — Products & Variants

**Phase:** 2 — Catalog
**Depends on:** Spec 06 (Categories)
**Blocks:** Spec 08 (Collections reference products), Spec 09 (public product listing/detail), Spec 13 (Cart references variants), Spec 17 (inventory choke point operates on variants)

---

## Objective

Add `Product`, `ProductImage`, and `ProductVariant` to the schema, and build staff CRUD for products with nested variant creation in a single call. This is the spec where the catalog becomes a real, sellable thing — variant `stock` created here is what Spec 17's inventory choke point will later manage.

---

## Context

Read the `Product`, `ProductImage`, `ProductVariant` blocks in `docs/schema.prisma`. Read `references/golden-rules.md` — rule 3 (money = `Decimal`) applies directly to `basePrice`/`compareAtPrice`/`priceOverride` here.

---

## Requirements

### 1. Schema additions

```prisma
model Product {
  id           String    @id @default(uuid())
  categoryId   String?   @map("category_id")
  name         String    @db.VarChar(191)
  slug         String    @unique @db.VarChar(191)
  description  String?
  fabric       String?   @db.VarChar(255)
  careInstructions String? @map("care_instructions") @db.VarChar(500)
  basePrice    Decimal   @map("base_price") @db.Decimal(12, 2)
  compareAtPrice Decimal? @map("compare_at_price") @db.Decimal(12, 2)
  isActive     Boolean   @default(true) @map("is_active")
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt    DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt    DateTime? @map("deleted_at") @db.Timestamptz(6)

  category    Category?           @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  images      ProductImage[]
  variants    ProductVariant[]

  @@index([categoryId])
  @@map("products")
}

model ProductImage {
  id        String   @id @default(uuid())
  productId String   @map("product_id")
  url       String   @db.VarChar(500)
  sortOrder Int      @default(0) @map("sort_order")
  isPrimary Boolean  @default(false) @map("is_primary")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([productId])
  @@map("product_images")
}

model ProductVariant {
  id            String   @id @default(uuid())
  productId     String   @map("product_id")
  size          String   @db.VarChar(20)
  color         String   @db.VarChar(50)
  sku           String   @unique @db.VarChar(100)
  priceOverride Decimal? @map("price_override") @db.Decimal(12, 2)
  stock         Int      @default(0)
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([productId, size, color])
  @@index([productId])
  @@map("product_variants")
}
```

Also: add `products Product[]` to the `Category` model created in Spec 06 (this is the deferred relation flagged in that spec).

Run `prisma migrate dev --name add_products_and_variants`.

### 2. Repository — `features/catalog/repository.ts` (extend)

- `createProductWithVariants(input)` — a single Prisma call using nested writes (`prisma.product.create({ data: { ..., images: { create: [...] }, variants: { create: [...] } } })`) so the product and all its variants/images are created atomically.
- `updateProduct(id, input)` — updates product-level fields only; variant mutation is separate (Requirement 4).
- `softDeleteProduct(id)` — sets `deletedAt`, `isActive: false`.
- `findProductById(id, { includeDeleted? })`.
- `findVariantBySku(sku)` — used for the duplicate-SKU check.
- `addVariant(productId, input)`, `updateVariant(variantId, input)`, `removeVariant(variantId)`.

### 3. Service — `features/catalog/service.ts` (extend)

- `createProduct(staffId, input)`:
  - Validate `categoryId` exists (if provided).
  - Validate all variant SKUs in the request are unique **within the request** (reject duplicate SKUs in the same payload before hitting the DB) and don't already exist (`findVariantBySku`) — surface as `ConflictError` with the offending SKU in the message, not a raw unique-constraint error.
  - Generate `slug` from `name` if not provided (same slugify + collision-suffix approach as Spec 06).
  - Create product + images + variants in one nested write.
- `updateVariant(staffId, variantId, input)` — for stock corrections at the catalog-management level (e.g. a manual recount). **Important:** this is a legitimate, narrow exception to the "stock choke point" rule — it exists for administrative stock correction, not order fulfillment. Note in the docstring exactly why it's allowed to touch `stock` directly (admin correction, not order-driven), so Spec 17 and later specs don't mistake it for a violation of the invariant.
- `deleteProduct(staffId, id)` — soft-delete only. Revisit Spec 06's category-deletion guard here: update `catalog.service.deleteCategory` to also check `prisma.product.count({ where: { categoryId, deletedAt: null } })` and block deletion if any active products remain.

### 4. Routes — `features/catalog/routes.ts` (extend)

```
POST   /api/v1/admin/products              staff (STAFF+)   — create product + variants + images
PATCH  /api/v1/admin/products/:id          staff (STAFF+)   — update product fields
DELETE /api/v1/admin/products/:id          staff (MANAGER+) — soft delete
POST   /api/v1/admin/products/:id/variants staff (STAFF+)   — add a variant to an existing product
PATCH  /api/v1/admin/variants/:id          staff (STAFF+)   — update a variant (incl. stock correction)
DELETE /api/v1/admin/variants/:id          staff (MANAGER+) — remove a variant
```

Public product listing/detail routes are Spec 09's responsibility, not this one — this spec is staff-write-only.

### 5. Schema — `features/catalog/schema.ts` (extend)

- `createProductSchema`: `name`, `categoryId?`, `description?`, `fabric?`, `careInstructions?`, `basePrice` (positive decimal string), `compareAtPrice?`, `images?: { url, sortOrder?, isPrimary? }[]`, `variants: { size, color, sku, priceOverride?, stock }[]` (at least one variant required).
- `updateProductSchema`: product-level fields only, all optional.
- `addVariantSchema` / `updateVariantSchema`: `size`, `color`, `sku`, `priceOverride?`, `stock`.
- Money fields validated as positive decimal strings, converted to `Decimal` in the service layer (per `references/golden-rules.md`).

---

## Out of Scope

- Public read endpoints (Spec 09).
- Cloudinary upload itself — `images[].url` accepted as an already-hosted URL string.
- The order-driven stock choke point (`commitOrderStock`/`releaseOrderStock`) — that's Spec 17, and operates on the `stock` field this spec creates.

---

## Acceptance Criteria

- [ ] A staff member can create a product with 3 variants (e.g. S/Black, M/Black, L/Black) in a single `POST` call, and all rows are created together.
- [ ] Submitting two variants with the same SKU in one request is rejected before any DB write.
- [ ] Submitting a SKU that already exists on another product/variant is rejected with a clean `ConflictError`.
- [ ] `productId + size + color` uniqueness is enforced (can't create the same size/color combo twice for one product).
- [ ] Soft-deleting a product sets `deletedAt` and `isActive: false` but does not remove the row — existing `OrderItem`s (once Spec 16 exists) will still resolve correctly against it.
- [ ] `updateVariant` can adjust `stock` directly (documented as the administrative-correction exception) — this does not conflict with the Spec 17 invariant since Spec 17 doesn't exist yet at this point in the build, but the docstring explaining the exception is present now.
- [ ] Attempting to delete a `Category` that still has active (non-deleted) products is rejected — this closes the TODO left in Spec 06.

## Test Requirements

- Nested create test: one call, product + 3 variants + 2 images, all present on read-back.
- Duplicate-SKU-in-payload rejection test.
- Duplicate-SKU-against-existing-row rejection test.
- `productId + size + color` uniqueness test.
- Soft-delete test: `deletedAt` set, row still queryable by id directly (for later order-history joins), `isActive: false`.
- Category deletion blocked by active product test (extends Spec 06's test suite).
