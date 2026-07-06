# Spec 12 — Recently Viewed

**Phase:** 3 — Discovery
**Depends on:** Spec 05 (Auth — needs `requireCustomer`), Spec 09 (Product Detail — this is where views get recorded)
**Blocks:** the `most_popular` sort forward-dependency noted in Spec 11 (partially)

---

## Objective

Track which products a customer has viewed, deduplicated per user+product (a repeat view updates the timestamp rather than creating a duplicate row), with a capped, most-recent-first list.

---

## Context

Read the `RecentlyViewed` block in `docs/schema.prisma`. Read `references/golden-rules.md` rule 1 — this is a customer-owned table, ownership-scoped by `userId` like every other one.

---

## Requirements

### 1. Schema

```prisma
model RecentlyViewed {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  productId String   @map("product_id")
  viewedAt  DateTime @default(now()) @map("viewed_at") @db.Timestamptz(6)

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([userId, productId])
  @@index([userId, viewedAt])
  @@map("recently_viewed")
}
```

Also add `recentlyViewed RecentlyViewed[]` to both `User` (Spec 04/05) and `Product` (Spec 07) — the deferred-relation pattern established in earlier specs.

Run `prisma migrate dev --name add_recently_viewed`.

### 2. Repository — `features/discovery/repository.ts` (extend)

- `recordView(userId, productId)` — an **upsert** keyed on the `@@unique([userId, productId])` constraint: if the row exists, update `viewedAt = now()`; if not, create it. Use Prisma's `upsert`, not a manual find-then-create/update (race-prone under concurrent requests).
- `listRecentlyViewed(userId, limit)` — ordered `viewedAt DESC`, capped at `limit` (default and max defined by a named constant, e.g. `RECENTLY_VIEWED_MAX = 50`, in `core/constants.ts`).
- `pruneOldViews(userId)` (optional, called from the service after `recordView` — see Requirement 3) — deletes rows beyond the cap for that user, keeping the list from growing unboundedly per user over time even though `listRecentlyViewed` already limits what's *returned*.

### 3. Service — `features/discovery/service.ts` (extend)

- `recordView(userId, productId)`:
  - Validate the product exists and is active (a view on a since-deleted product shouldn't create a dangling/confusing entry) — if the product is inactive/deleted, no-op silently rather than erroring (viewing is a passive, best-effort action; it shouldn't be able to break the product-detail request that triggers it).
  - Calls the repository's upsert, then prunes if the user's total row count exceeds `RECENTLY_VIEWED_MAX * some small multiple` (don't prune on every single call if it's not needed yet — e.g. only prune when count > 60 to avoid a delete query on every view when the list is already capped at 50 for display; this is a minor efficiency note, not a strict requirement, but document whichever threshold you pick).
- `listRecentlyViewed(userId)` — ownership-scoped by construction (always uses the authenticated `req.user.id`, never accepts a `userId` from the request body/params).
- Wire `recordView` into `catalog.service.getProductDetail` (Spec 09) — but **only when a customer session is present**. Guest/unauthenticated product-detail views record nothing (there's no `userId` to key on) — confirm `getProductDetail`'s public route doesn't require auth just to make this work; the call to `recordView` is conditional on `req.user` being present, made from the controller layer (which has access to the request), not forced into the public service function's signature.

### 4. Routes — `features/discovery/routes.ts` (extend)

```
GET /api/v1/me/recently-viewed   requireCustomer
```

Recording a view is **not** a separate endpoint the client calls — it's a side effect of `GET /api/v1/products/:idOrSlug` (Spec 09's product detail route), triggered server-side when `req.user` is present. Do not build a separate `POST .../recently-viewed` endpoint; that would let the client record fake views for products never actually fetched, and duplicates logic that belongs in one place.

### 5. Schema — `features/discovery/schema.ts` (extend)

- No new request body schema needed — `recordView` is an internal service call, not a validated public input. `listRecentlyViewed` takes no query params beyond auth (or an optional `limit` capped at `RECENTLY_VIEWED_MAX`).

---

## Out of Scope

- Surfacing "Recently Viewed" as a home-screen section (that's `catalog.getHomeSections`, Spec 08 — this spec only builds the data + the dedicated list endpoint; wiring it into the home screen response, if desired, is a small follow-up touching Spec 08's function, not this spec).
- Cross-device sync beyond what the DB already provides (it's already server-side per-user, so this is inherent, not extra work).

---

## Acceptance Criteria

- [ ] Viewing the same product twice (as the same user) results in exactly one `RecentlyViewed` row, with `viewedAt` updated to the second view's time.
- [ ] `GET /api/v1/me/recently-viewed` returns the user's views ordered most-recent-first, capped at `RECENTLY_VIEWED_MAX`.
- [ ] A guest (unauthenticated) request to `GET /api/v1/products/:idOrSlug` does not create any `RecentlyViewed` row and does not error.
- [ ] Viewing an inactive/soft-deleted product's detail page (if reachable at all — recall Spec 09 404s these for public callers) does not create a dangling `RecentlyViewed` row.
- [ ] `GET /api/v1/me/recently-viewed` is ownership-scoped — customer A never sees customer B's recently-viewed list, verified by a direct test (not just "it uses `req.user.id`," but an actual attempt to see another user's data returns nothing/404 as appropriate).
- [ ] Exceeding the cap (viewing more than `RECENTLY_VIEWED_MAX` distinct products) results in the list still returning only the most recent `RECENTLY_VIEWED_MAX`, and old entries eventually get pruned from storage (not just hidden from the list).

## Test Requirements

- Dedup test: view the same product twice, assert one row, updated timestamp.
- Ordering test: view several products in sequence, assert list order matches view order (most recent first).
- Guest-view test: unauthenticated product detail request creates no row.
- Cap/pruning test: exceed the threshold, confirm both the returned list is capped and (if pruning is implemented per Requirement 2) the underlying row count doesn't grow unboundedly.
- Ownership-scoping test: two users, distinct view histories, each only ever sees their own.
