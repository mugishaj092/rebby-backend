# Spec 09 — Product Detail & Public Listing

**Phase:** 2 — Catalog
**Depends on:** Spec 07 (Products & Variants), Spec 08 (Collections & Banners)
**Blocks:** Spec 10 (Search builds on the same listing query base), Spec 13 (Cart needs product/variant detail to validate against)

---

## Objective

Build the public, unauthenticated read side of the catalog: a paginated product listing endpoint, a full product detail endpoint, and listing filtered by category or collection. This is the first spec where "live stock" (the actual current `ProductVariant.stock` values) is exposed to the client — no caching or staleness tricks yet, just a correct direct read.

---

## Context

Read `docs/project-overview.md` (Product Details section of the original REBY spec, folded into `docs/project-overview.md`'s Screens → Tables table) for what a product detail response needs to include. This spec is public-only — no staff routes.

---

## Requirements

### 1. Repository — extend `features/catalog/repository.ts`

- `listProducts({ categoryId?, collectionId?, cursor?, limit?, sort? })`:
  - Only returns products where `isActive: true AND deletedAt: null`.
  - Supports cursor-based pagination (recommended: `id`-based cursor with a stable secondary sort, e.g. `createdAt DESC, id DESC`) or offset/limit — pick one and document it in the response shape; cursor-based is preferred per `docs/architecture.md`'s API design principles.
  - Includes at minimum: `id`, `name`, `slug`, `basePrice`, `compareAtPrice`, primary image, and a lightweight stock-availability flag (`inStock: boolean`, derived from `variants.some(v => v.stock > 0)`) — not the full variant list, to keep listing payloads light.
- `getProductDetail(idOrSlug)`:
  - Returns the full product including `category`, all `images` (ordered by `sortOrder`), and all `variants` with their live `stock`.
  - Throws `NotFoundError` if the product doesn't exist, is soft-deleted, or `isActive: false` (public callers can't distinguish "doesn't exist" from "inactive" — both 404 the same way, per `references/errors-and-envelope.md`'s "don't leak existence" note, applied here even though this isn't ownership-sensitive data, for endpoint consistency).

### 2. Service — extend `features/catalog/service.ts`

- `listProducts(query)` — validates/normalizes pagination and sort params, delegates to the repository, shapes the response envelope with pagination metadata (`nextCursor`, or `page`/`totalPages` depending on the chosen scheme).
- `getProductDetail(idOrSlug)` — delegates to the repository; computes a `relatedProducts` list is **out of scope for this spec** (recommendations belong to a later discovery/nice-to-have spec) — leave a `// TODO` marker rather than building it now.

### 3. Routes — extend `features/catalog/routes.ts`

```
GET /api/v1/products                  public — listProducts (paginated, optional ?categoryId=, ?collectionId=)
GET /api/v1/products/:idOrSlug        public — getProductDetail
GET /api/v1/categories/:id/products   public — listProducts scoped to one category
GET /api/v1/collections/:slug/products public — listProducts scoped to one collection
```

The last two are thin wrappers around the same `listProducts` service function with the relevant filter pre-applied — do not duplicate the query logic.

### 4. Schema — extend `features/catalog/schema.ts`

- `listProductsQuerySchema`: `cursor?` (string), `limit?` (int, 1–50, default 20), `categoryId?` (uuid), `collectionId?` (uuid). (Sort options land in Spec 11 — this spec can default to `createdAt DESC` only.)

---

## Out of Scope

- Search (Spec 10).
- Filtering by size/color/price/availability beyond category/collection (Spec 11).
- Related products / "complete the look" (future — flagged as out of scope for MVP in `docs/project-overview.md`).
- Recently viewed tracking (Spec 12) — viewing a product here does not yet record anything.

---

## Acceptance Criteria

- [ ] `GET /api/v1/products` returns only active, non-deleted products, paginated, with no auth required.
- [ ] `GET /api/v1/products/:idOrSlug` returns full detail including every variant's current `stock` value — confirmed live (not cached/stale) by updating stock directly and re-fetching within the same test.
- [ ] Requesting a soft-deleted or inactive product's detail returns 404, not the product data.
- [ ] `GET /api/v1/categories/:id/products` returns only products in that category (and, if you choose to support it, its subcategories — document whichever choice you make).
- [ ] `GET /api/v1/collections/:slug/products` returns exactly the collection's product set, respecting `CollectionProduct.sortOrder`.
- [ ] Pagination works correctly across a boundary (e.g. 25 products, `limit=20` — first page returns 20, second page returns the remaining 5 with no duplicates or gaps).

## Test Requirements

- Listing test excluding inactive/deleted products from results.
- Detail test confirming live stock reflects a direct DB update made mid-test.
- 404-on-inactive/deleted-product test.
- Category-scoped and collection-scoped listing tests.
- Pagination boundary test (exact page-size boundary, and a final partial page).
