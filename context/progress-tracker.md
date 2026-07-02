# Progress Tracker

Update this file after every completed task. Any AI agent reading this should immediately know what is done, what is in progress, and what is next.

---

## Current Status

**Phase:** 1 — Foundation
**Last completed:** 01 Project Skeleton
**Next:** 02 Prisma Setup & Base Schema

---

## Progress

### Phase 1 — Foundation
- [x] 01 Project Skeleton
- [ ] 02 Prisma Setup & Base Schema
- [ ] 03 Core Middleware & Error Handling
- [ ] 04 Identity Models + Migration
- [ ] 05 Auth Integration (Clerk)

### Phase 2 — Catalog
- [ ] 06 Categories
- [ ] 07 Products & Variants
- [ ] 08 Collections & Banners
- [ ] 09 Product Detail & Public Listing

### Phase 3 — Discovery
- [ ] 10 Search
- [ ] 11 Filtering & Sorting
- [ ] 12 Recently Viewed

### Phase 4 — Cart & Wishlist
- [ ] 13 Cart
- [ ] 14 Promo Codes on Cart
- [ ] 15 Wishlist

### Phase 5 — Checkout & Orders
- [ ] 16 Order & Payment Models
- [ ] 17 Inventory Choke Point
- [ ] 18 Checkout — Order Creation
- [ ] 19 Order Read Endpoints
- [ ] 20 Order Cancellation

### Phase 6 — Payments
- [ ] 21 MoMo & Airtel Provider Adapters
- [ ] 22 Payment Webhook Idempotency
- [ ] 23 Cash on Delivery
- [ ] 24 Refunds

### Phase 7 — Notifications & Background Jobs
- [ ] 25 Push Notification Service
- [ ] 26 Order Status Notifications
- [ ] 27 Unpaid Order Release Job
- [ ] 28 Price-Drop & Back-in-Stock Alerts

### Phase 8 — Admin
- [ ] 29 Admin Dashboard Metrics
- [ ] 30 Admin Order Management
- [ ] 31 Admin Customer Management
- [ ] 32 Promotions Management

### Phase 9 — Support & Hardening
- [ ] 33 Return & Refund Requests
- [ ] 34 Ownership & Invariant Test Sweep
- [ ] 35 OpenAPI & Seed Script

---

## Decisions Made During Build

*(Log deviations from the spec, schema adjustments, and non-obvious implementation choices here — one bullet per task, tagged with the task number, so a future session can see why something was done a certain way without re-deriving it.)*

- **[01]** `module`/`moduleResolution` set to `CommonJS`/`Node` rather than `NodeNext`, to avoid ESM `.js`-extension import churn while the codebase is small; revisit if a dependency forces ESM-only. Path alias `@/*` still resolves at dev-time via `tsx`'s native tsconfig-paths support and at build-time via `tsc-alias` (new devDependency — required because `tsc` alone does not rewrite `paths` aliases in emitted JS).
- **[01]** Added `cors`, `morgan`, `dotenv` (prod deps) and `tsx`, `tsc-alias`, `eslint-config-prettier`, `typescript-eslint`, `@eslint/js`, `supertest`, `vitest`, plus their `@types/*`, to the approved-dependency list in `code-standards.md` — these were implied by spec 01's explicit requirements (request logger, CORS, env file loading, dev/build tooling, testing) but weren't itemized there.
- **[01]** Added an optional `CORS_ORIGIN` env var (comma-separated origins) to `config/env.ts`, not in the spec's enumerated required-vars list, because spec 01 §3 explicitly asks for "CORS (configurable origin via env, default permissive in dev)". It's optional so it doesn't add a new required var; unset it falls back to permissive in `development` and restrictive otherwise.
- **[01]** `env.ts` exports `parseEnv` (pure, throws `EnvValidationError` with a readable message) separately from the module-level `env` singleton (which catches that error and calls `process.exit(1)`) — this lets tests call `parseEnv` directly with a mock object without triggering a real process exit on import, per the spec's test-requirement note.
- **[01]** `TODO(spec N): ...` comment markers were kept in `app.ts` for not-yet-built middleware/route mounts, per spec 01 §3's explicit example, despite `code-standards.md`'s general "never leave TODO comments" rule — spec 01 wins here as the more specific instruction for this exact placeholder.
- **[01]** `.gitignore` and `.prettierignore` were created (didn't exist before); `.prettierignore` excludes `context/`, `.agents/`, `.claude/`, `AGENTS.md`, `CLAUDE.md` since those are project docs/skills, not code this project's tooling should reformat.
- **[01]** Post-review decision: `NODE_ENV`/`PORT` keep Zod `.default(...)` values (development / 4000) rather than being strictly required like the other 6 env vars — confirmed with the developer as the intended, pragmatic behavior. `tsconfig.json`'s extra `noUncheckedIndexedAccess: true` was reviewed and kept (harmless added strictness, no scope conflict).

