# Spec 11 — Filtering & Sorting

**Phase:** 3 — Discovery
**Depends on:** Spec 09 (Product Detail & Public Listing), Spec 10 (Search)
**Blocks:** none directly, but the mobile app's browse/search UI depends on this for a usable experience

---

## Objective

Extend the product listing and search query paths with combinable filters (category, size, color, price range, availability, new-arrivals, on-sale) and sort options (newest, price asc/desc, best-selling, most popular). This spec unifies filtering/sorting into one shared query-building layer used by both `catalog.listProducts` (Spec 09) and `discovery.search` (Spec 10), rather than duplicating filter logic in two places.

---

## Context

Read Spec 09 and Spec 10 before starting — this spec modifies both `features/catalog/repository.ts` (`listProducts`) and `features/discovery/repository.ts` (`searchProducts`) to accept a shared filter/sort object, rather than adding filters independently to each.

---

## Requirements

### 1. Shared filter/sort types — `features/discovery/types.ts` (or `core/` if genuinely shared beyond discovery — recommended: keep in `discovery` since catalog imports *from* discovery for this, not the reverse)

```ts
export interface ProductFilters {
  categoryId?: string;
  size?: string;
  color?: string;
  minPrice?: Decimal;
  maxPrice?: Decimal;
  availability?: 'in_stock' | 'all'; // default 'all'
  newArrivals?: boolean;   // createdAt within a recent window (e.g. last 30 days) — window is a named constant, not a magic number
  onSale?: boolean;        // compareAtPrice IS NOT NULL AND compareAtPrice > basePrice
}

export type ProductSort =
  | 'newest'
  | 'price_asc'
  | 'price_desc'
  | 'best_selling'
  | 'most_popular';
```

### 2. Shared query-building helper — `features/discovery/queryBuilder.ts`

- `buildProductWhereClause(filters: ProductFilters)` — translates the filter object into a Prisma `where` clause fragment. Size/color filters apply at the `variants` relation level (`variants: { some: { size, color, stock: { gt: 0 if availability=in_stock } } }`).
- `buildProductOrderBy(sort: ProductSort)` — translates sort into a Prisma `orderBy` (or a raw SQL `ORDER BY` fragment for `best_selling`/`most_popular`, since those aren't simple columns — see Requirement 3).
- Both `catalog.repository.listProducts` and `discovery.repository.searchProducts` call these two helpers rather than each building their own `where`/`orderBy` — this is the point of this spec: one filter/sort implementation, two entry points.

### 3. `best_selling` and `most_popular` sort — defining the metrics

These aren't stored columns, so they require a computed aggregate. Decide and document the exact definition (don't leave it ambiguous — a later spec, or a real customer-facing ranking, will silently disagree with itself if this isn't nailed down now):

- **`best_selling`**: total `OrderItem.quantity` summed across all **non-cancelled** orders for that product, over all time (or a rolling window, e.g. last 90 days — pick one; rolling window is recommended so best-sellers reflect current demand, not lifetime totals). Requires a join/subquery against `OrderItem`/`Order` — this means `best_selling` sort **cannot ship until `Order`/`OrderItem` exist (Spec 16)**. Until then, this spec should implement the sort option to accept the value and fail gracefully (return results unsorted-by-this-metric, or throw a clear "not yet available" error) rather than crash — note this explicitly as a forward dependency.
- **`most_popular`**: define as a combination of view count (`RecentlyViewed` rows, Spec 12) and wishlist adds (`WishlistItem`, a later Cart & Wishlist phase spec) — same forward-dependency issue as `best_selling`. For *this* spec, implement `most_popular` as an alias for `newest` with a `// TODO(spec 12+/15): implement real popularity scoring once RecentlyViewed/WishlistItem exist` marker, rather than building half of the metric now and half later in a way nobody remembers to reconcile.

This dependency reality should be reflected in `progress-tracker.md`'s "Decisions Made During Build" once this spec is implemented, so it's visible to whoever builds the later specs.

### 4. Extend `features/catalog/repository.ts` (`listProducts`)

- Accept `filters: ProductFilters` and `sort: ProductSort` params, threaded through from the existing `listProductsQuerySchema` (Spec 09), applying `buildProductWhereClause`/`buildProductOrderBy`.

### 5. Extend `features/discovery/repository.ts` (`searchProducts`)

- Accept the same `filters`/`sort` params in addition to the text query — combined filtering *and* search (e.g. "search 'dress' within category X under 20,000 RWF") must intersect correctly, not be mutually exclusive modes.

### 6. Schema updates

- Extend `listProductsQuerySchema` (Spec 09) and `searchQuerySchema` (Spec 10) with: `categoryId?`, `size?`, `color?`, `minPrice?`, `maxPrice?`, `availability?`, `newArrivals?` (boolean, coerced from `"true"`/`"false"` query string), `onSale?` (boolean, coerced), `sort?` (enum of the five values above, default `newest`).
- Validate `minPrice <= maxPrice` when both are provided (refine, reject otherwise).

---

## Out of Scope

- Style/occasion/material filters (mentioned in the original product spec's filter list but not modeled in `docs/schema.prisma` — would require a schema addition; flagged as a future enhancement, not built here).
- Actually completing `best_selling`/`most_popular` scoring — see Requirement 3's forward-dependency notes.

---

## Acceptance Criteria

- [ ] Combining `categoryId` + `size` + a price range returns the correct intersection — verified with a seeded dataset where some products match only some of the filters.
- [ ] `availability=in_stock` excludes products where every variant has `stock: 0`.
- [ ] `onSale=true` returns only products where `compareAtPrice > basePrice`.
- [ ] `newArrivals=true` returns only products created within the defined window.
- [ ] `sort=price_asc` and `sort=price_desc` order correctly (using `basePrice`, or `priceOverride` where set on the matching variant — document which price is used when filters narrow to a specific variant).
- [ ] `sort=newest` (the default) orders by `createdAt DESC`.
- [ ] `sort=best_selling` and `sort=most_popular` do not crash — they either apply the real metric (if Spec 16/wishlist dependencies are already done in your build order) or fall back cleanly per Requirement 3.
- [ ] The same filter/sort combination applied to `GET /api/v1/products` (catalog listing) and `GET /api/v1/search?q=...` (discovery search) produces consistent, non-duplicated filtering logic — verified by the two repositories both calling the shared `queryBuilder.ts` functions (a code-review-level check, not just a behavioral one).

## Test Requirements

- Combined-filter intersection test (category + size + price range) against a seeded dataset with deliberately overlapping-but-not-identical matches.
- Each individual filter tested in isolation (availability, new-arrivals, on-sale).
- Each sort order tested for correct ordering, including a tie-breaking rule for `price_asc`/`price_desc` (e.g. secondary sort by `id` for deterministic pagination).
- A test confirming `catalog.listProducts` and `discovery.searchProducts` both call `buildProductWhereClause`/`buildProductOrderBy` (or produce identical filtering results given the same filter object) rather than diverging.
- Min/max price validation test (`minPrice > maxPrice` rejected).
