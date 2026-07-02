# Progress Tracker

Update this file after every completed task. Any AI agent reading this should immediately know what is done, what is in progress, and what is next.

---

## Current Status

**Phase:** 1 — Foundation
**Last completed:** 04 Identity Models + Migration
**Next:** 05 Auth Integration (Clerk)

---

## Progress

### Phase 1 — Foundation
- [x] 01 Project Skeleton
- [x] 02 Prisma Setup & Base Schema
- [x] 03 Core Middleware & Error Handling
- [x] 04 Identity Models + Migration
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
- **[01]** Post-spec: `npm run dev` switched from `tsx watch src/server.ts` to `nodemon` (config in `nodemon.json`, watching `src/**/*.ts`, execing `tsx src/server.ts` on change) — developer preference; `tsx` is still the actual TS runner (keeps `@/*` alias resolution working), nodemon only owns the watch/restart loop. Added `nodemon` to the approved-dependency list.
- **[01]** `tsconfig.json`: dropped deprecated `baseUrl` (no longer required alongside `paths` since TS 4.1; `@/*` now maps to `./src/*` with an explicit leading `./`). Upgraded `typescript` devDependency from `^5.7.3` to `^6.0.3` (current stable — `7.0` is already in RC) since the IDE's language server was already on 6.x and disagreed with the older CLI on the valid `ignoreDeprecations` value; added `"ignoreDeprecations": "6.0"` to silence the `moduleResolution=node10` deprecation warning (still functions through TS 6.x, only removed in 7.0 — consistent with the earlier CommonJS/`node10` decision above). Verified `typescript-eslint@8.x` supports TS `<6.1.0`, so no eslint bump needed.
- **[02]** `npm install prisma` resolved to **Prisma v7.8.0**, not the v6-era API spec 02's code snippets were written against. Followed `.claude/skills/prisma-upgrade-v7` to adapt: generator uses `provider = "prisma-client"` (not the legacy `prisma-client-js`) with a mandatory `output` path and `moduleFormat = "cjs"` (matching this repo's CommonJS decision from spec 01, not the skill's ESM-first default); `datasource db` no longer inlines `url` (deprecated in v7) — the URL now lives in a new root-level `prisma.config.ts`. SQL driver adapters are mandatory in v7, so `@prisma/adapter-pg` + `pg` (+ `@types/pg`) were added and wired into `src/db/prisma.ts`'s singleton; added to the approved-dependency list in `code-standards.md`. The four enums, their values, and `@@map` names match `context/schema.prisma` exactly — verified via `psql \dT+` after migration.
- **[02]** Generated Prisma Client output set to `src/generated/prisma` (not the skill's default root-level `../generated/prisma`) because `tsconfig.build.json` restricts `rootDir` to `src`; the v7 `prisma-client` generator emits `.ts` source (not precompiled JS) that must be compiled by the build, so it has to live inside `rootDir`. Added `src/generated/` to `.gitignore`, `.prettierignore`, and eslint `ignores`.
- **[02]** `docker-compose.yml` (Postgres 16, named volume `reby_postgres_data`) added per spec, and documented in new `docs/local-setup.md` — this is the reproducible path for a clean clone. This session's actual migration ran against the developer's existing local native PostgreSQL 18 install instead (already configured in `.env`, port 5432 already occupied by the native service), since spec 02 explicitly allows "or document the equivalent."
- **[02]** `tests/setup.ts` now imports `dotenv/config` before applying env fallbacks (so a real `.env` `DATABASE_URL` is used in tests when present, dummy placeholder otherwise — needed for spec 02's connectivity-test requirement) and force-sets `NODE_ENV='test'` unconditionally instead of only defaulting it. `tests/config/env.test.ts` is unaffected (calls `parseEnv` directly with a mock object, not `process.env`). Added `tests/db/prisma.test.ts` running a real `SELECT 1` through the singleton.
- **[02]** Added an explicit connectivity check + success log ("Database connection established successfully") in `src/server.ts` before `app.listen`, at the developer's request. Initially used `prisma.$connect()`, but that turned out to be a no-op with v7 driver adapters — the underlying `pg` pool connects lazily on the first real query, so `$connect()` resolved (and logged success) even against a nonexistent database/bad credentials, confirmed by testing with a deliberately invalid `DATABASE_URL`. Fixed by running an actual `prisma.$queryRaw\`SELECT 1\`` instead, which forces a real round-trip and correctly throws (causing `main().catch()` to log and `process.exit(1)`) on bad credentials — verified against both a bad and a working `DATABASE_URL`.
- **[02]** `app.listen(...)` in `src/server.ts` is now wrapped in a `Promise` that resolves on the `listening` callback and rejects on the server's `'error'` event, so failures like `EADDRINUSE` flow into the same `main().catch()` path as the DB check instead of surfacing as an unhandled `'error'` event with a raw stack dump. Verified by starting two instances on the same port — the second now exits cleanly via `"Failed to start server: ..."` instead of crashing with an uncaught exception trace.
- **[03]** `errorHandler`'s log context prefix uses `[<method> <path>]` (e.g. `[GET /orders/123]`) rather than the `code-standards.md` example's feature-scoped `[orders.service.createOrder]` format — the middleware is generic and has no feature/service context to draw on at that layer. Feature-level services should still log with the `[feature.service.function]` pattern from within their own `catch` blocks before rethrowing; the request-scoped prefix here is specific to the top-level handler.
- **[03]** Added a `res.headersSent` guard at the top of `errorHandler` (defers to `next(err)` instead of writing a response) — not called out explicitly in spec 03, but standard Express guidance for error-handling middleware to avoid a hard crash (`ERR_HTTP_HEADERS_SENT`) if an error occurs after a response has already started streaming. Nothing streams yet, but this middleware is permanent infrastructure every future feature routes through. Added post-review, with a unit test (`tests/core/middleware/errorHandler.unit.test.ts`) covering the guard directly since it can't be exercised via a clean Supertest round trip.
- **[03]** `validate(...)` throws `ValidationError` synchronously from inside the middleware function body (rather than calling `next(err)`), matching spec 03 §4's literal wording ("on failure, throws `ValidationError`"). This relies on Express 4's built-in behavior of catching synchronous throws in middleware/route handlers automatically — safe here since `validate` is fully synchronous. Future async controllers must still use the `try/catch` + `next(err)` pattern already documented in `code-standards.md`, since Express 4 does not auto-catch throws inside `async` functions.
- **[04]** Added `User`, `StaffProfile`, `Address` to `prisma/schema.prisma`, matching `context/schema.prisma` field-for-field (relations to not-yet-existing models — `Cart`, `Wishlist`, `Order`, `Notification`, `RecentlyViewed`, `OrderStatusHistory`, `RefundRequest`, `Order.address` — intentionally omitted per spec, to be added incrementally by their owning specs). Ran `prisma migrate dev --name add_identity_models`; verified the generated SQL has the `user_id` FK on `addresses` with `ON DELETE CASCADE ON UPDATE CASCADE`, unique constraints on both `clerk_id`/`email` columns, and the `addresses.user_id` index — all matching spec 04's acceptance criteria. `prisma generate` had to be re-run manually after the migration for `tsc --noEmit` to pick up the new `User`/`StaffProfile`/`Address` client types (migrate dev's auto-generate step didn't refresh `src/generated/prisma` in this session). Tests added at `tests/db/identity-models.test.ts` (not under `tests/features/` since this spec is schema-only — no repository/service layer exists yet for these models) using `prisma.user.create`/`prisma.address.create` directly, covering: `User` defaults (`notificationsEnabled: true`, `deletedAt: null`), FK enforcement on `Address.userId` against a nonexistent user, and cascade delete of `Address` rows when the owning `User` is deleted.
- **[tooling]** Added `@vitest/coverage-v8` (`code-standards.md` dependency list updated) and a `coverage` script (`vitest run --coverage`) at developer request. `vitest.config.ts` extends Vitest's default coverage excludes (rather than replacing them) with `src/generated/**`, so the generated Prisma client doesn't dilute the coverage numbers. Also drove full-suite coverage from ~86% up to **100% statements/branches/functions/lines**, adding targeted tests for previously-unexercised paths: `logger.ts` (never called directly before — `errorHandler.test.ts`'s spy replaced its real body), `app.ts`'s `resolveCorsOrigin` (both the permissive-dev and explicit-allow-list branches), and `db/prisma.ts`'s `NODE_ENV` branches (dev/test logging config, `globalThis` caching outside production). To close the last branch gap in `env.ts`'s `loadEnv()` — the `if (err instanceof EnvValidationError)` guard's non-`EnvValidationError` path, previously unreachable through the public API — `loadEnv` was exported with an optional injectable `parse` function (defaulting to `parseEnv`), extending the same pure/side-effecting split already established for `parseEnv` in the spec 01 decision above. This is a real behavioral seam (verifies `loadEnv` truly distinguishes expected validation failures from unexpected ones), not a coverage-only hack.

