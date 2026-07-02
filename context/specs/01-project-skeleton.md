# Spec 01 — Project Skeleton

**Phase:** 1 — Foundation
**Depends on:** nothing (first task)
**Blocks:** all subsequent specs

---

## Objective

Stand up the Express + TypeScript project skeleton: app factory, server bootstrap, typed environment loading, the feature-based folder structure, and tooling config (TypeScript strict mode, ESLint, Prettier). No business logic, no database, no auth yet — this spec only makes the app boot and respond to a health check.

---

## Context

Read `docs/architecture.md` (folder structure section) and `docs/code-standards.md` (TypeScript rules, naming) before starting. This spec creates the skeleton those docs describe — every folder created here should match the tree in `architecture.md` exactly, even if most are empty (with a `.gitkeep` or an `index.ts` stub) until later specs fill them in.

---

## Requirements

### 1. Package setup
- Initialize a Node.js project targeting Node 20+.
- `tsconfig.json` with `strict: true`, `target: ES2022`, `module: NodeNext` (or the project's chosen module system), `esModuleInterop: true`, path alias `@/*` → `src/*`.
- ESLint config (flat config or `.eslintrc`) with the TypeScript plugin, no-explicit-any rule enabled as an error.
- Prettier config — pick sane defaults (semi: true, singleQuote: true, printWidth: 100) and document them in `.prettierrc`.
- `package.json` scripts: `dev` (ts-node-dev or tsx watch mode), `build`, `start`, `lint`, `format`, `typecheck` (`tsc --noEmit`), `test`.

### 2. Typed environment loading
Create `src/config/env.ts`:
- A Zod schema validating required env vars at boot: `NODE_ENV`, `PORT`, `DATABASE_URL` (placeholder value acceptable at this stage — Prisma isn't wired yet), `CLERK_SECRET_KEY`, `REDIS_URL`, `CLOUDINARY_URL`, `FCM_SERVER_KEY`, `SENTRY_DSN`.
- Parse `process.env` through the schema on import; throw a clear, readable error (not a raw Zod stack trace) and `process.exit(1)` if validation fails.
- Export a typed `env` object — nothing downstream reads `process.env` directly again.
- Provide a `.env.example` at the repo root listing every variable with a placeholder value and a one-line comment.

### 3. App factory
Create `src/app.ts`:
- Exports a `createApp(): Express` function (not a side-effecting module-level `app`) so tests can create isolated instances.
- Registers: `express.json()`, a request logger (simple, e.g. `morgan` in dev), CORS (configurable origin via env, default permissive in dev), and — as placeholders for later specs — mount points for `core` middleware that don't exist yet (comment markers are fine, e.g. `// TODO(spec 03): mount error handler here`).
- Registers a `GET /health` route directly in `app.ts` (not a feature) returning `{ success: true, data: { status: 'ok' } }`.

### 4. Server bootstrap
Create `src/server.ts`:
- Imports `env`, calls `createApp()`, starts `app.listen(env.PORT, ...)`.
- Logs a clean startup message (port, environment) — no secrets logged.
- This is the file referenced by `npm run dev` / `npm start`.

### 5. Folder structure
Create the full tree from `docs/architecture.md`, even where empty:

```
src/
  server.ts
  app.ts
  config/
    env.ts
  core/
    middleware/
    errors/
    utils/
    validation/
  db/
  features/
    auth/
    catalog/
    discovery/
    cart/
    wishlist/
    orders/
    inventory/
    payments/
    notifications/
    admin/
    support/
  jobs/
prisma/
tests/
  setup.ts
```
Empty feature folders can hold a single `.gitkeep` — do not scaffold `routes.ts`/`controller.ts`/etc. files in features that later specs own. Creating empty placeholder files for future specs is out of scope for this task.

---

## Out of Scope

- Prisma / database connection (Spec 02)
- Any middleware logic beyond what's needed to boot (Spec 03)
- Any feature route beyond `/health`
- Auth of any kind (Spec 05)

---

## Acceptance Criteria

- [ ] `npm run dev` boots without errors.
- [ ] `GET /health` returns `{ "success": true, "data": { "status": "ok" } }` with HTTP 200.
- [ ] `npm run typecheck` passes with zero errors.
- [ ] `npm run lint` passes clean.
- [ ] Missing a required env var causes the app to fail fast at boot with a readable error message, not a crash mid-request.
- [ ] Folder structure matches `docs/architecture.md`.
- [ ] `.env.example` exists and lists every variable currently required.

## Test Requirements

- A Supertest test that boots `createApp()` and asserts `GET /health` returns the expected envelope and status code.
- A unit test for `env.ts`: valid env parses correctly; a missing required var throws (this can be tested by calling the parsing function directly with a mock env object, not by unsetting real `process.env`).
