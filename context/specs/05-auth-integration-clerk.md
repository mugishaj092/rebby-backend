# Spec 05 — Auth Integration (Clerk)

**Phase:** 1 — Foundation
**Depends on:** Spec 03 (Core Middleware & Error Handling), Spec 04 (Identity Models + Migration)
**Blocks:** every customer-facing and admin-facing feature spec (all of them use `requireCustomer` / `requireStaff`)

---

## Objective

Integrate Clerk for both access levels: a webhook handler that keeps `User` rows in sync with Clerk, and the two access-control middlewares — `requireCustomer` and `requireStaff(minRole)` — that every later route will use. This spec also creates the `features/auth/` feature folder as the first real (non-skeleton) feature.

---

## Context

Read `references/access-levels.md` in full before starting — it is the exact contract this spec implements. Read `docs/architecture.md` (Two Authentication Flows section) for the rationale.

---

## Requirements

### 1. Clerk webhook handler — `features/auth/`

- `features/auth/routes.ts`: `POST /api/v1/auth/webhook` (or the current Clerk-recommended webhook path) — **not** behind `requireCustomer`/`requireStaff`, since Clerk calls it directly. Protect it instead by verifying the Clerk webhook signature (using Clerk's SDK/svix verification).
- `features/auth/service.ts`:
  - `handleUserCreated(clerkPayload)` — creates a `User` row (`clerkId`, `name`, `email`, `phone` if present) unless the Clerk payload's `publicMetadata.role` marks it as staff, in which case create/update a `StaffProfile` row instead (`role` defaulting to `staff` unless metadata says otherwise).
  - `handleUserUpdated(clerkPayload)` — syncs `name`/`email`/`phone` changes onto the existing `User` or `StaffProfile` row (matched by `clerkId`).
  - `handleUserDeleted(clerkPayload)` — soft-deletes the `User` (`deletedAt = now()`); do not hard-delete (order history integrity — see `docs/architecture.md`). `StaffProfile` deletion sets `isActive = false` instead of a hard delete.
- `features/auth/repository.ts`: thin Prisma access for the above (`findByClerkId`, `create`, `update`).
- `features/auth/schema.ts`: Zod schema for the subset of the Clerk webhook payload this handler actually reads — don't model the entire Clerk payload, just the fields used.

### 2. `requireCustomer` middleware — `core/middleware/requireCustomer.ts`

- Verifies the incoming Clerk session token (via Clerk's Express/Node SDK).
- On success, looks up the `User` by `clerkId` (via `features/auth/repository.ts`). If no matching `User` exists yet (e.g. webhook hasn't landed), throw `UnauthorizedError` — do not silently create one here; user creation is the webhook's job, not this middleware's.
- Attaches `req.user = { id, clerkId, email, ... }` (typed — extend the Express `Request` type via a `.d.ts` declaration file).
- Missing/invalid session → `UnauthorizedError` (401).
- A valid session that resolves to a `StaffProfile` instead of a `User` (i.e. a staff Clerk account hitting a customer route) → `ForbiddenError` (403), not treated as a valid customer.

### 3. `requireStaff(minRole)` middleware — `core/middleware/requireStaff.ts`

- A middleware **factory**: `requireStaff(minRole: StaffRole)` returns an Express middleware.
- Verifies the Clerk session, looks up `StaffProfile` by `clerkId`. If none exists, or `isActive === false` → `ForbiddenError`.
- Role comparison: `STAFF < MANAGER < OWNER` (define this ordering as a small helper/constant, not ad hoc numeric comparisons scattered around). If the profile's role is below `minRole` → `ForbiddenError`.
- Attaches `req.staff = { id, clerkId, role, ... }`.
- A valid session that resolves to a `User` instead of `StaffProfile` (customer session hitting a staff route) → `ForbiddenError`.

### 4. Type augmentation

- `src/types/express.d.ts` (or similar): augment `Express.Request` with optional `user?: AuthenticatedUser` and `staff?: AuthenticatedStaff` fields so `req.user!.id` / `req.staff!.id` are typed correctly in controllers without casting.

### 5. A minimal protected test route (temporary, for verification only)

- Add a throwaway `GET /api/v1/_debug/whoami` (customer) and `GET /api/v1/_debug/staff-whoami` (staff, `minRole: STAFF`) that just echoes `req.user`/`req.staff`. These exist purely to prove the middleware works end to end during this spec's verification and may be removed once a real protected route exists in a later spec — note their removal (or keep them behind a `NODE_ENV !== 'production'` guard) in `progress-tracker.md`.

---

## Out of Scope

- Any real feature route (catalog, cart, orders, etc.) — those are later specs and will simply import `requireCustomer`/`requireStaff` once this spec is done.
- Seeding a first staff account (owner) — that's either a manual Clerk dashboard step or part of the Spec 35 seed script.
- Rate limiting on auth endpoints (mentioned in `architecture.md`, not required here).

---

## Acceptance Criteria

- [ ] A Clerk "user created" webhook event results in a new `User` row with the correct `clerkId`/`email`/`name`.
- [ ] A Clerk "user created" event with `publicMetadata.role` set to a staff role results in a `StaffProfile` row instead, not a `User` row.
- [ ] A Clerk "user deleted" webhook soft-deletes the `User` (`deletedAt` set) rather than removing the row.
- [ ] A request with a valid customer Clerk session reaches `GET /api/v1/_debug/whoami` and `req.user` is populated correctly.
- [ ] A request with no session, or an invalid/expired token, is rejected with 401 on both debug routes.
- [ ] A valid **customer** session hitting `GET /api/v1/_debug/staff-whoami` is rejected with 403.
- [ ] A valid **staff** session with `role: staff` hitting a route requiring `minRole: OWNER` is rejected with 403.
- [ ] A valid **staff** session with `role: owner` reaches a route requiring `minRole: STAFF` (role hierarchy is inclusive upward).
- [ ] `npm run typecheck` passes — `req.user`/`req.staff` are properly typed in a controller without manual casting.

## Test Requirements

- Webhook handler tests for created/updated/deleted events, covering both the customer and staff branches (mock the Clerk payload — don't call real Clerk in tests).
- `requireCustomer` tests: valid session → `req.user` populated; missing session → 401; staff session on a customer route → 403.
- `requireStaff` tests: each role-hierarchy combination relevant to the table in `references/access-levels.md` (staff hitting staff-minimum route: pass; staff hitting owner-minimum route: 403; owner hitting staff-minimum route: pass; customer session: 403).
- A signature-verification test for the webhook route: a payload with an invalid/missing Clerk signature is rejected before it reaches `handleUserCreated`/etc.
