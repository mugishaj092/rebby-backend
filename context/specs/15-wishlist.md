# Spec 15 — Wishlist

**Phase:** 4 — Cart & Wishlist
**Depends on:** Spec 05 (Auth), Spec 07 (Products & Variants)
**Blocks:** Spec 28 (Price-Drop & Back-in-Stock Alerts read from `WishlistItem`), the `most_popular` sort forward-dependency noted in Spec 11

---

## Objective

Build the customer wishlist: add/remove/list products (optionally pinned to a specific variant, e.g. a specific size), ownership-scoped, with duplicate adds treated as a no-op rather than an error.

---

## Context

Read the `Wishlist`/`WishlistItem` blocks in `docs/schema.prisma`. This feature follows the exact same ownership-scoping pattern established in Spec 13 (Cart) — reuse that pattern, don't reinvent it.

---

## Requirements

### 1. Schema

```prisma
model Wishlist {
  id        String   @id @default(uuid())
  userId    String   @unique @map("user_id")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  user  User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  items WishlistItem[]

  @@map("wishlists")
}

model WishlistItem {
  id         String   @id @default(uuid())
  wishlistId String   @map("wishlist_id")
  productId  String   @map("product_id")
  variantId  String?  @map("variant_id")
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  wishlist Wishlist        @relation(fields: [wishlistId], references: [id], onDelete: Cascade)
  product  Product         @relation(fields: [productId], references: [id], onDelete: Cascade)
  variant  ProductVariant? @relation(fields: [variantId], references: [id], onDelete: SetNull)

  @@unique([wishlistId, productId])
  @@index([wishlistId])
  @@map("wishlist_items")
}
```

Add `wishlist Wishlist?` to `User` (deferred relation), and `wishlistItems WishlistItem[]` to `Product` and `ProductVariant` (Spec 07).

Note the `@@unique([wishlistId, productId])` is on **product**, not product+variant — a wishlist entry is per-product; `variantId` is an optional "I specifically want this size" annotation on that entry, not a separate uniqueness axis. Adding the same product with a different `variantId` updates the existing entry's `variantId` rather than creating a second row (see Requirement 3).

Run `prisma migrate dev --name add_wishlist`.

### 2. Repository — `features/wishlist/repository.ts`

- `findOrCreateWishlist(userId)` — same pattern as Spec 13's `findOrCreateCart`.
- `findWishlistItem(wishlistId, productId)`.
- `addItem(wishlistId, productId, variantId?)`.
- `updateItemVariant(wishlistItemId, variantId)`.
- `removeItem(wishlistItemId)`.
- `listItems(wishlistId)` — includes product (name, image, current price, `inStock`) and, if `variantId` is set, that variant's current stock — this is what powers price-drop/back-in-stock checks later (Spec 28), so make sure live price/stock is actually joined in, not just the ids.
- Same rule as Spec 13: every read/update/delete resolves the wishlist via `userId` first; a `wishlistItemId` is never operated on without confirming it belongs to that user's wishlist.

### 3. Service — `features/wishlist/service.ts`

- `addItem(userId, { productId, variantId? })`:
  - Validate the product exists (active or not — recall from Spec 12's pattern that a wishlist add on an inactive product should probably still be blocked; throw `NotFoundError` if inactive/deleted).
  - If an entry for that `productId` already exists on the user's wishlist: **no-op** if `variantId` matches (or both are unset); if a **different** `variantId` is provided, update the existing entry's `variantId` rather than erroring or creating a duplicate — either way, this is idempotent from the caller's perspective and never throws a "already exists" error.
- `removeItem(userId, wishlistItemId)` — same ownership check as Cart.
- `listWishlist(userId)` — ownership-scoped, always from `req.user.id`.

### 4. Routes — `features/wishlist/routes.ts`

```
GET    /api/v1/wishlist                      requireCustomer
POST   /api/v1/wishlist/items                requireCustomer  — { productId, variantId? }
DELETE /api/v1/wishlist/items/:wishlistItemId requireCustomer
```

### 5. Schema — `features/wishlist/schema.ts`

- `addWishlistItemSchema`: `productId` (uuid), `variantId?` (uuid).

---

## Out of Scope

- Organizing wishlist items into named collections (mentioned as a nice-to-have in the original product spec, not modeled in `docs/schema.prisma`).
- Sharing a wishlist (nice-to-have, not built).
- Price-drop / back-in-stock notification logic itself — Spec 28 reads from this feature's data but the alerting job is out of scope here.

---

## Acceptance Criteria

- [ ] Adding a product to the wishlist twice (same `productId`, no `variantId` change) results in exactly one row — verified as a genuine no-op, not a silently-swallowed error.
- [ ] Adding the same product a second time with a **different** `variantId` updates the existing row's `variantId` rather than creating a second entry.
- [ ] `GET /api/v1/wishlist` returns each item with current product price and, where a `variantId` is set, that variant's current stock.
- [ ] Customer A can never read or delete an item on customer B's wishlist — a real `wishlistItemId` belonging to B returns `NotFoundError` for A, matching the Cart spec's pattern exactly.
- [ ] Adding an inactive/soft-deleted product to the wishlist is rejected with `NotFoundError`.

## Test Requirements

- Duplicate-add no-op test (identical add twice → one row).
- Variant-update-on-repeat-add test (same product, different variant → row updated, not duplicated).
- Ownership-scoping test, mirroring Spec 13's — customer A attempting to act on customer B's `wishlistItemId`.
- Inactive-product rejection test.
- Live-data test: change a product's price after wishlisting it, confirm `GET /api/v1/wishlist` reflects the new price (not a snapshot taken at add-time).
