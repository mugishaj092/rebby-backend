# Spec 02 — Prisma Setup & Base Schema

**Phase:** 1 — Foundation
**Depends on:** Spec 01 (Project Skeleton)
**Blocks:** Spec 04 (Identity Models), and every subsequent spec that touches the database

---

## Objective

Wire up Prisma against PostgreSQL: install and configure Prisma, create the initial `schema.prisma` with the datasource/generator blocks and the four shared enums the rest of the schema depends on, and expose a single `PrismaClient` singleton the whole app will import. No domain models (User, Product, Order, etc.) yet — those belong to later specs. This spec only proves the Prisma ↔ PostgreSQL connection works end to end.

---

## Context

Read `docs/schema.prisma` (the full target schema) and `references/golden-rules.md` before starting — this spec creates the foundation that schema builds on. Read `references/env-and-dependencies.md` for the `DATABASE_URL` convention.

---

## Requirements

### 1. Install Prisma
- Add `prisma` (dev dependency) and `@prisma/client` (dependency).
- `npx prisma init` (or manual equivalent) to create `prisma/schema.prisma` and confirm `.env` picks up `DATABASE_URL`.

### 2. Datasource & generator
In `prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### 3. Shared enums
Add the four enums that domain models across multiple later specs will reference. Match `docs/schema.prisma` exactly — do not rename values or add ones not listed there:

```prisma
enum StaffRole {
  staff
  manager
  owner

  @@map("staff_role")
}

enum OrderStatus {
  pending
  confirmed
  preparing
  packed
  shipped
  out_for_delivery
  delivered
  cancelled
  returned
  refunded

  @@map("order_status")
}

enum PaymentStatus {
  pending
  succeeded
  failed
  refunded

  @@map("payment_status")
}

enum PaymentProvider {
  momo
  airtel
  cod
  card

  @@map("payment_provider")
}
```

Note: these enums won't be referenced by any model until Specs 04, 16+. Prisma allows unreferenced enums to exist in the schema — this is expected and temporary.

### 4. PrismaClient singleton
Create `src/db/prisma.ts`:
```ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});
```
- Exactly one instance, exported and reused everywhere. No feature or test file ever calls `new PrismaClient()` directly.
- In `dev` mode with hot-reload, guard against creating multiple clients across reloads (the standard `globalThis` singleton pattern for Prisma + ts-node-dev/tsx watch mode).

### 5. Local Postgres for development
- Add a `docker-compose.yml` (or document the equivalent) that runs a local PostgreSQL 16 container for development, with a named volume for persistence.
- Document the setup steps in `README.md` (or a `docs/local-setup.md`): start Postgres, set `DATABASE_URL`, run migrations.

### 6. Initial migration
- Run `prisma migrate dev --name init` against the local database.
- Confirm it applies cleanly and creates the `staff_role`, `order_status`, `payment_status`, `payment_provider` Postgres enum types with no tables yet.

---

## Out of Scope

- Any domain model (`User`, `Product`, `Order`, etc.) — those are Spec 04 onward.
- Seed scripts (Spec 35).
- Row-locking / transaction patterns for stock (Spec 17).

---

## Acceptance Criteria

- [ ] `npx prisma generate` runs with no errors.
- [ ] `npx prisma migrate dev` creates and applies an initial migration with no errors, against a local Postgres instance.
- [ ] The four enums exist as Postgres enum types after migration, with values matching `docs/schema.prisma` exactly.
- [ ] `src/db/prisma.ts` exports a single reusable `PrismaClient` instance; no other file in the codebase instantiates `PrismaClient`.
- [ ] The app still boots (`npm run dev`) and `GET /health` still works — Prisma wiring hasn't broken Spec 01's baseline.
- [ ] Local Postgres setup is documented and reproducible from a clean clone.

## Test Requirements

- A test (or a documented manual check, if a real DB connection in CI isn't set up yet) that connects via `prisma` and runs a trivial query (e.g. `SELECT 1`) to confirm connectivity.
- Confirm `prisma migrate dev` is idempotent — running it again with no schema changes reports "already in sync," not an error.
