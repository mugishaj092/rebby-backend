# AGENTS.md

**Read this file first, in full, before doing anything in this repository.**

This is **REBY**, a single-store fashion e-commerce platform for Rwanda (Express.js + TypeScript + Prisma + PostgreSQL). This build covers the **commerce core** end to end: catalog, cart, checkout, orders, and payments.

You are operating as a **senior engineer**. Think before you implement. Build only what the current task requires. Finish one task fully — code, tests, and a progress update — before starting the next.

---

## 0. The Golden Rules (never violate these)

1. **Ownership scoping is sacred.** Every query against a customer-owned table (`Cart`, `Order`, `Address`, `Wishlist`, `RecentlyViewed`, `Notification`) is scoped by the authenticated user's `userId`. A query that touches these tables without that filter is a data leak and is unacceptable.
2. **Never change stock without going through the choke point.** All `ProductVariant.stock` changes go through `features/inventory/service.ts → commitOrderStock(...)` / `releaseOrderStock(...)`, which write inside the same transaction as the `Order`/`OrderItem` change that caused them. Nothing else writes to `stock`.
3. **Money is always `Decimal`, never `number`.** Prisma `Decimal @db.Decimal(12, 2)` in the schema, `Prisma.Decimal` in TypeScript.
4. **Payment webhooks are idempotent.** Every provider callback handler looks up `Payment` by its unique `providerReference` and no-ops if already in a terminal state before transitioning anything.
5. **Scope is sacred.** Build only what the current task in `build-plan.md` specifies. Do not add features, fields, or endpoints "while you're here."
6. **Every feature ships with a test.** If it cannot be verified immediately, it is not done.
7. **Customer and staff access are never mixed in one route.** Every route uses exactly one of `requireCustomer` or `requireStaff(minRole)`, or is explicitly marked public.

If a task seems to require breaking one of these rules, stop and flag it instead of proceeding.

---

## 1. Context Files — read in this order

Read these before writing code. They are the source of truth; when in doubt, they win over your assumptions.

| Order | File | What it gives you |
|---|---|---|
| 1 | `context/project-overview.md` | What the platform is, the modules, the core flows, scope |
| 2 | `context/architecture.md` | Stack, **feature-based folder structure**, layering, access-level design, the stock invariant |
| 3 | `context/code-standards.md` | The rules you follow every session — TypeScript, Express, Prisma, models/schemas/repos/services patterns |
| 4 | `context/build-plan.md` | The ordered task list — what to build next and how to verify it |
| 5 | `context/progress-tracker.md` | What is done, in progress, and next. **Update this after every task.** |

Reference material (read when relevant to the task):

| File | When to read it |
|---|---|
| `context/schema.prisma` | Full schema reference — match your models to this exactly |

> Adjust the `context/` prefix to wherever you place these files. If they live at the repo root, drop the prefix.

---

## 2. Database Schema (source of truth)

The target schema is defined in `schema.prisma` at the repo root (or `docs/schema.prisma` if kept alongside the other docs). Your `prisma/schema.prisma` must match it exactly — same model names, fields, types, relations, and `onDelete` behavior. Do not invent fields. If the schema needs a change, update the source schema file and note it in `progress-tracker.md` under "Decisions Made During Build."

---

## 3. Folder Structure — Feature-Based (Vertical Slice)

Organized **by feature, not by technical layer.** Each feature folder under `src/features/` owns its full stack:

```
src/features/<feature>/
  routes.ts        # Express routes + middleware wiring
  controller.ts     # parses/validates request, calls service, shapes response
  service.ts        # business logic, transactions, rule enforcement
  repository.ts     # ownership-scoped Prisma data access
  schema.ts         # Zod Create/Update/Read schemas
```

Shared, cross-cutting code lives in `src/core/` and `src/db/` — **not** inside any feature.

**Feature boundary rules:**
- A feature owns its full stack; nothing feature-specific lives outside its folder.
- **Cross-feature calls go through services only.** `orders/service.ts` may call `inventory.service.commitOrderStock`, but must never import another feature's `repository.ts` directly.
- `core/` holds code used by two or more features (middleware, error types, shared Zod helpers). If it's used by one feature only, it stays in that feature.
- Dependency direction flows one way: `orders`/`payments` → `inventory` → `catalog` → `core`. No circular imports.
- **`inventory` has no routes** — it's a service-only internal feature owned entirely by `orders` (and later `admin`) calling into it.

Full annotated tree is in `architecture.md`.

---

## 4. Within Each Feature — strict layering

Feature-based changes *where files live*, not the internal discipline:

```
routes.ts  →  controller.ts  →  service.ts  →  repository.ts  →  Prisma / db
                    ↓                ↓
               schema.ts       (business rules)
```

- **Routes** — declares endpoints, attaches middleware (`requireCustomer` / `requireStaff` / `validate`). No logic.
- **Controller** — thin. Parse/validate → call service → shape HTTP response.
- **Service** — all business logic. Orchestrates repositories (and other features' services), enforces rules, owns transactions.
- **Repository** — all DB access, ownership-scoped by construction for customer tables. Service never calls `prisma.<model>` directly.
- A controller never imports a repository directly. A repository never holds business logic.

---

## 5. Stack

Express.js · TypeScript (strict) · Prisma · PostgreSQL · Zod · argon2id + JWT access/refresh tokens (customer + staff auth) · Redis · BullMQ · Cloudinary · Firebase Cloud Messaging.
Approved dependencies are listed in `code-standards.md`. **Do not add a package without updating that list and explaining why.**

---

## 6. Per-Task Workflow (follow every time)

1. **Open `progress-tracker.md`** → find the next unchecked task.
2. **Open `build-plan.md`** → read that task's description and its verification criteria.
3. **Re-read** the relevant parts of `architecture.md` / `code-standards.md` for the area you're touching.
4. **Implement** the task — only what it specifies, following the feature structure and layering.
5. **Write the test(s)** that prove the verification criteria. For customer features, include the ownership-scoping test. For anything stock-related, assert the invariant. For payment webhooks, include the idempotency (replay) test.
6. **Run** linters and tests: `eslint`, `prettier --check`, `tsc --noEmit`, `npm test`. All must pass.
7. **Generate/run the migration** if the schema changed (`prisma migrate dev`), and confirm it against `schema.prisma`.
8. **Update `progress-tracker.md`:** tick the task, set Current Status (Phase / Last completed / Next), and log any decision or deviation under "Decisions Made During Build."
9. Stop. Do not start the next task in the same pass unless explicitly asked.

---

## 7. Definition of Done (per task)

A task is complete only when **all** of these are true:

- [ ] Implements exactly what `build-plan.md` specifies — no more, no less.
- [ ] Follows the feature structure and internal layering.
- [ ] All money values use `Decimal`; all customer-table DB access is ownership-scoped.
- [ ] Tests exist and pass, including the ownership-scoping test (customer features), the stock invariant (order/inventory features), and idempotency (payment webhook features).
- [ ] `eslint`, `prettier`, `tsc --noEmit`, and the test suite are all green.
- [ ] Migration generated, reviewed, and applied (if schema changed).
- [ ] `progress-tracker.md` updated.

---

## 8. Skills — use them proactively, don't wait to be asked

Skills exist to keep engineering discipline consistent across sessions. **Invoke the relevant skill automatically at the point in the workflow where it belongs — do not wait for the user to type `/architect`, `/review`, etc. manually.** Treat each trigger below as a rule to act on, the same as any other rule in this file.

### The Engineering Loop

```
/remember restore  →  /architect  →  Build  →  /review  →  Ship
                                         ↓
                                    /imprint (after every UI component)
                                         ↑
                                    /recover (when something breaks)
```

| Skill | Auto-invoke when | What it does |
|---|---|---|
| `remember` (restore) | **Start of every session** — before doing anything else, restore context from `memory.md` if it exists. | Restores prior session context so nothing is re-derived from scratch. |
| `architect` | **Before starting any non-trivial feature/task** — new endpoint, schema change, cross-feature work. Skip only for trivial one-line fixes. | Thinks through the implementation like a senior engineer, surfaces decisions, produces a plan to confirm before code is written. |
| `review` | **Immediately after finishing any feature**, before marking a task done in `progress-tracker.md`. | Checks plan alignment, architecture/golden-rule compliance, and production-readiness. Reports issues; does not fix them — you decide what to act on. |
| `imprint` | **After building any UI-facing artifact** (if/when this repo grows a UI layer, e.g. an admin dashboard) — capture the component's visual patterns into `ui-registry.md`. | Keeps new UI consistent with what was already built. |
| `remember` (save) | **End of every session**, or whenever context is about to be lost/compacted. | Compresses what matters into `memory.md` so the next session isn't blank. |
| `recover` | **The moment something breaks or a debugging loop stalls** — before re-prompting for another patch. | Diagnoses whether the failure needs a targeted fix, a hard reset, or a full rethink, then prescribes the response. |

### Domain skills (Prisma, Clerk, Cloudinary, Swagger, Node.js patterns, etc.)

Also check `.claude/skills/` for a skill relevant to the specific library or task at hand (`prisma-client-api`, `prisma-database-setup`, `clerk-backend-api`, `clerk-setup`, `cloudinary-*`, `generate-swagger-docs`, `nodejs-backend-patterns`, …) and follow its guidance whenever you touch that part of the stack — invoke it because the task calls for it, not because the user asked by name.

**`rebby-backend` (`.claude/skills/rebby-backend/`, including its `references/*.md` like `golden-rules.md`) is this project's own skill and always takes priority.** If any other skill's guidance — including the engineering-loop skills above — conflicts with it, `rebby-backend` wins.

---

## 9. When You're Unsure

- **Conflicting instructions?** The context docs win over your training-data assumptions. `architecture.md` and `code-standards.md` are authoritative.
- **Schema ambiguity?** Match `schema.prisma`. Don't guess fields.
- **A rule seems to block the task?** Stop and surface the conflict — do not silently work around a Golden Rule.
- **Tempted to add scope?** Don't. Note the idea in `progress-tracker.md` under Notes and move on.
- **Library API differs from what you remember?** Read the official docs (Express / Prisma / Zod / jsonwebtoken / argon2) before implementing — these APIs have changed and your memory may be stale.
