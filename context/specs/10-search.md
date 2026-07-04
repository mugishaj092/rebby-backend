# Spec 10 — Search

**Phase:** 3 — Discovery
**Depends on:** Spec 09 (Product Detail & Public Listing)
**Blocks:** Spec 11 (Filtering & Sorting builds on the same query base)

---

## Objective

Add text search across products (name/description) and exact SKU search, as its own `features/discovery/` feature — separate from `catalog`, since discovery concerns (search, filters, sort, recently viewed) are read-only, cross-cutting query logic over the catalog, not catalog management itself.

---

## Context

Read `docs/architecture.md`'s folder structure — `discovery` is a distinct feature from `catalog`, calling into catalog's repository or querying the same tables directly via its own repository (either is acceptable; pick one and be consistent — recommended: `discovery` has its own repository since its queries are structurally different from catalog's CRUD-shaped ones). Read `references/folder-structure.md` for the cross-feature call rule.

---

## Requirements

### 1. Feature scaffold

Create `features/discovery/`: `routes.ts`, `controller.ts`, `service.ts`, `repository.ts`, `schema.ts`.

### 2. Search strategy decision (make this explicit, don't leave it implicit)

Two viable approaches — choose one and document the choice in `progress-tracker.md` under "Decisions Made During Build":

- **Option A — `ILIKE`:** simple `WHERE name ILIKE '%query%' OR description ILIKE '%query%'`. Fast to build, fine for MVP catalog sizes, no ranking beyond basic ordering.
- **Option B — Postgres full-text search (`tsvector`/`tsquery`):** add a generated `search_vector` column (or a computed index) combining `name` + `description` with weighting (name weighted higher than description), and query with `to_tsquery`/`plainto_tsquery`, ordered by `ts_rank`. Better relevance ranking, marginally more setup (a migration adding the generated column + a GIN index).

**Recommendation for this spec: Option B.** It's not meaningfully more complex to implement and avoids having to redo this spec later when `ILIKE` search quality becomes a visible problem. If you go with Option A instead for speed, note it as a deliberate MVP simplification in `progress-tracker.md` so it's easy to revisit.

If Option B: add to `prisma/schema.prisma` via a raw SQL migration (Prisma doesn't natively model generated `tsvector` columns — use `prisma migrate dev --create-only` and hand-edit the generated SQL, or a subsequent raw migration):

```sql
ALTER TABLE products ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED;

CREATE INDEX products_search_vector_idx ON products USING GIN (search_vector);
```

### 3. Repository — `features/discovery/repository.ts`

- `searchProducts(query: string, { cursor?, limit? })`:
  - Only active, non-deleted products (same base filter as Spec 09's `listProducts`).
  - Option B: `WHERE search_vector @@ plainto_tsquery('english', $1) ORDER BY ts_rank(search_vector, plainto_tsquery('english', $1)) DESC`, via `prisma.$queryRaw` (Prisma's query builder doesn't support `tsvector` operators natively).
  - Returns the same lightweight listing shape as Spec 09's `listProducts` (id, name, slug, price, primary image, `inStock`) — reuse that shape/type, don't invent a parallel one.
- `findVariantBySku(sku: string)`:
  - Exact match (`WHERE sku = $1`), returns the parent product's lightweight shape plus which specific variant matched.

### 4. Service — `features/discovery/service.ts`

- `search(query, pagination)` — trims/validates the query string (reject empty-after-trim with `ValidationError`), delegates to the repository.
- `searchBySku(sku)` — exact match only; if not found, return an empty result (not a 404 — this is a search endpoint, not a resource-detail endpoint, so "no results" is a valid 200 response, not an error).

### 5. Routes — `features/discovery/routes.ts`

```
GET /api/v1/search?q=...&cursor=...&limit=...   public
GET /api/v1/search/sku/:sku                      public
```

### 6. Schema — `features/discovery/schema.ts`

- `searchQuerySchema`: `q` (string, 1–100 chars after trim), `cursor?`, `limit?` (1–50, default 20).
- `skuSearchParamsSchema`: `sku` (string, matches the SKU format used in Spec 07, e.g. non-empty, max 100 chars).

---

## Out of Scope

- Filtering/sorting combined with search (Spec 11 adds filter/sort params; this spec's `search` endpoint accepts only `q` + pagination).
- Search history / popular searches (nice-to-have, not in this build's scope per `docs/project-overview.md`).
- Voice search (explicitly future, per the original product spec).

---

## Acceptance Criteria

- [ ] Searching a distinctive word from a product's `name` returns that product.
- [ ] Searching a distinctive word from a product's `description` (but not present in `name`) still returns that product, ranked below products where the term matches `name`.
- [ ] `GET /api/v1/search/sku/:sku` returns a result only on an exact SKU match — a partial/substring SKU returns no results, not a fuzzy match.
- [ ] Inactive/soft-deleted products never appear in search results.
- [ ] An empty or whitespace-only `q` is rejected with a validation error, not treated as "match everything."
- [ ] Pagination on search results behaves the same way as Spec 09's product listing (consistent cursor/limit contract).

## Test Requirements

- Name-match vs description-match ranking test (name match ranks higher).
- Exact-SKU-match test and no-partial-match test.
- Exclusion of inactive/deleted products from both search paths.
- Empty-query rejection test.
- Pagination test consistent with Spec 09's approach.
