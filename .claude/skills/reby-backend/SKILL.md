---
name: reby-backend
description: Conventions and workflow for REBY's backend (Express.js + TypeScript + Prisma + PostgreSQL, feature-based/vertical-slice structure). Use whenever writing, reviewing, or planning any code in this repository — implementing a build-plan task, adding a route/service/repository, touching the Prisma schema, or reasoning about stock/payment/order logic.
---

# REBY Backend Conventions

This repo follows spec-driven development. Full docs live in `docs/`:

- `docs/project-overview.md` — what REBY is, modules, core flows, scope
- `docs/architecture.md` — stack, feature-based folder structure, access-level enforcement, the stock commit invariant, payment/order state machine
- `docs/code-standards.md` — TypeScript/Express/Prisma conventions, response envelope, naming
- `docs/build-plan.md` — the ordered, numbered task list with verify steps
- `docs/progress-tracker.md` — what's done / in progress / next — update after every task
- `docs/schema.prisma` — the source-of-truth schema
- `docs/AGENTS.md` — the full per-task workflow and definition of done

## When this skill applies

Any time you are about to write or modify code in this repository, or plan a task from `build-plan.md`.

## What to do

1. Read `docs/progress-tracker.md` first to find the next unchecked task (unless the user names a specific task).
2. Read that task's entry in `docs/build-plan.md` for scope and verify criteria.
3. Re-read the relevant sections of `docs/architecture.md` and `docs/code-standards.md` for the feature area being touched.
4. Follow these non-negotiable rules without exception:
   - **Ownership scoping**: every query on `Cart`, `Order`, `Address`, `Wishlist`, `RecentlyViewed`, `Notification` is scoped by the authenticated `userId`.
   - **Stock choke point**: `ProductVariant.stock` only changes via `inventory.service.commitOrderStock` / `releaseOrderStock`, inside the same transaction as the `Order`/`OrderItem` write.
   - **Money is `Decimal`**, never `number`.
   - **Payment webhooks are idempotent** — look up `Payment` by `providerReference`, no-op if already terminal.
   - **Feature-based layout**: `routes.ts → controller.ts → service.ts → repository.ts`, cross-feature calls go through services only.
5. Implement only what the task specifies — no extra scope.
6. Write the test(s) that prove the task's verify criteria, including the ownership-scoping test and/or stock invariant test where relevant.
7. Run `eslint`, `prettier --check`, `tsc --noEmit`, and the test suite — all must pass.
8. If the Prisma schema changed, run the migration and confirm it matches `docs/schema.prisma`.
9. Update `docs/progress-tracker.md`: tick the task, update Current Status, log any deviation under "Decisions Made During Build."
10. Stop after one task unless explicitly told to continue.

## If something's unclear

The docs in `docs/` win over training-data assumptions. If a task seems to require breaking one of the rules above, stop and flag it instead of proceeding.
