# Architecture

The technical design of the platform. Read this before writing any code. Every decision here is deliberate — do not deviate without updating this file.

---

## Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict mode) |
| Runtime | Node.js 20+ |
| Web framework | Express.js |
| ORM | Prisma |
| Database | PostgreSQL 16+ |
| Validation | Zod |
| Auth | Custom email + password (argon2id-hashed), short-lived signed access-token JWTs + long-lived opaque, rotating, revocable refresh tokens (httpOnly cookie), distinguished by role |
| Caching | Redis |
| Background jobs | BullMQ |
| Image storage | Cloudinary |
| Push notifications | Firebase Cloud Messaging |
| API docs | Swagger / OpenAPI (`swagger-jsdoc` or `zod-to-openapi`) |
| Error tracking | Sentry |
| Testing | Vitest (or Jest), Supertest |

All request handlers are `async`. No blocking I/O in the request path.

---

## Folder Structure — Feature-Based (Vertical Slice)

The project is organized **by feature, not by technical layer.** Everything belonging to one feature — its routes, controller, service, repository, and validation schemas — lives together in that feature's folder. You should be able to understand or change a feature by opening one directory.

```
src/
  server.ts               # HTTP server bootstrap
  app.ts                  # Express app factory, middleware registration, route mounting
  config/
    env.ts                # typed env loading (zod-validated)
    redis.ts
    cloudinary.ts
    fcm.ts

  core/                    # cross-cutting code shared by ALL features (not a feature itself)
    middleware/
      requireCustomer.ts   # verifies access-token JWT statelessly (no DB hit) → attaches req.user
      requireStaff.ts      # verifies access-token JWT + role, statelessly → attaches req.staff
      errorHandler.ts      # converts typed errors to the response envelope
      responseEnvelope.ts
      rateLimit.ts         # IP-based limiter on register/login/staff-login
      extractBearerToken.ts
    security/
      password.ts          # hashPassword/verifyPassword (argon2id)
      jwt.ts                # signAccessToken/verifyAccessToken, generateRefreshToken/hashRefreshToken
    errors/
      AppError.ts          # base + typed errors (NotFoundError, InsufficientStock, ...)
    utils/
    validation/
      pagination.ts        # shared Zod schemas

  db/
    prisma.ts              # PrismaClient singleton

  features/                # ← every feature is a self-contained vertical slice
    auth/
      routes.ts             # customer /api/v1/auth/*, staff /api/v1/admin/auth/*
      controller.ts
      service.ts             # register/login/refresh/logout, lockout, refresh-token rotation + reuse detection
      repository.ts
      schema.ts
      cookies.ts             # httpOnly refresh-token cookie config (separate customer/staff cookies)
      index.ts

    catalog/                # categories, collections, products, variants, banners
      routes.ts
      controller.ts
      service.ts
      repository.ts
      schema.ts
      index.ts

    discovery/               # search, filters, sort, recently viewed
      routes.ts
      controller.ts
      service.ts
      repository.ts
      schema.ts
      index.ts

    cart/
      routes.ts
      controller.ts
      service.ts             # promo code application logic
      repository.ts
      schema.ts
      index.ts

    wishlist/
      routes.ts
      controller.ts
      service.ts
      repository.ts
      schema.ts
      index.ts

    orders/                  # checkout, order lifecycle, status history
      routes.ts
      controller.ts
      service.ts              # createOrder(...) — the checkout choke point
      repository.ts
      schema.ts
      index.ts

    inventory/                # NOT a customer-facing feature — internal stock logic
      service.ts               # commitOrderStock(...), releaseOrderStock(...) — the stock choke point
      repository.ts

    payments/
      routes.ts
      controller.ts
      service.ts               # provider adapters, webhook handling (idempotent)
      repository.ts
      schema.ts
      providers/
        momo.ts
        airtel.ts
        cod.ts
      index.ts

    notifications/
      service.ts                # sendPush(...), templated notification content
      repository.ts

    admin/                      # dashboard metrics, product/order/customer management, reports
      routes.ts
      controller.ts
      service.ts
      repository.ts
      schema.ts
      index.ts

    support/                    # return/refund requests
      routes.ts
      controller.ts
      service.ts
      repository.ts
      schema.ts
      index.ts

  jobs/                        # BullMQ job processors
    releaseUnpaidOrders.ts     # releases stock for orders whose payment never confirmed
    priceDropAlerts.ts
    backInStockAlerts.ts

  api.ts                       # mounts every feature's router under /api/v1

prisma/
  schema.prisma
  migrations/

tests/
  setup.ts
  features/                    # tests mirror the feature folders
    catalog/
    orders/
    payments/
    ...

.env
package.json
tsconfig.json
```

### Rules for the feature-based layout

- **A feature owns its full stack.** `features/orders/` contains the routes, controller, service, repository, and schema for orders — nothing order-specific lives outside it.
- **`core/` and `db/` are NOT features.** They hold genuinely shared, cross-cutting code (middleware, error types, the Prisma client, shared validation). If something is used by two or more features, it belongs here; if it's used by one, it stays in that feature.
- **`inventory/` is a service-only internal feature** — it has no routes of its own. It exists purely so stock logic has one home and one owner, callable from `orders` (and later `admin`) via its service.
- **Cross-feature calls go through the service layer only.** `orders/service.ts` may import `inventory.service.commitOrderStock`. It must NOT import `inventory`'s repository directly. Features talk to each other through services, never by reaching into another feature's internals.
- **No circular dependencies.** Direction flows roughly: `orders`/`payments` → `inventory` → `catalog` → `core`. If two features need each other both ways, the shared piece moves to `core/`.
- **One `PrismaClient` instance**, exported from `db/prisma.ts` and imported everywhere. Never instantiate a second client.

---

## Internal Layering Within Each Feature

Feature-based structure organizes *files by feature*; inside a feature, the **same strict layering still applies**:

```
routes.ts  →  controller.ts  →  service.ts  →  repository.ts  →  Prisma / db
                                     ↓
                                 schema.ts (Zod validation)
```

- **Routes** — declares Express routes and wires middleware (`requireCustomer`, `requireStaff`, validation). No logic.
- **Controller** — thin. Parses/validates the request (via the Zod schema), calls the service, shapes the HTTP response. No business logic, no DB queries.
- **Service** — all business logic for the feature. Orchestrates its repository (and other features' services), enforces rules, owns transactions.
- **Repository** — all DB access for the feature, via Prisma. The service never calls `prisma.<model>` directly — it calls the repository.
- **Schema** — Zod schemas for request validation and (where useful) response shaping.

A controller never imports a repository directly. A repository never contains business logic. These rules hold *inside every feature folder*.

---

## Access-Level Enforcement

There is no multi-tenancy in REBY, but there **is** a hard boundary between customer and staff access, enforced in two layers:

### 1. Middleware
- `requireCustomer` — verifies the access-token JWT (`Authorization: Bearer <token>`) **statelessly** (signature + expiry only, no DB hit), checks the `type` claim is `"customer"`, attaches `req.user = { id, email }` directly from the token payload. Used on all customer routes (cart, wishlist, orders, etc.).
- `requireStaff(minRole)` — verifies the access-token JWT statelessly, checks `type: "staff"` and `role >= minRole` (`STAFF < MANAGER < OWNER`) from the token's own claims, attaches `req.staff = { id, email, role }`. Used on all `/admin` routes.
- A route is never left without one of these two (or an explicit `public` marker for genuinely public catalog-browsing routes).
- **Tradeoff, by design:** since access tokens aren't re-checked against the DB, an account deactivation/role change/lock takes up to `ACCESS_TOKEN_TTL_MINUTES` (default 15) to reach an already-issued token. The refresh endpoint *does* hit the DB (see below), so the delay is bounded by the access-token TTL, not the (much longer) refresh-token TTL.

### 2. Repository-level ownership scoping
- Every repository method touching a customer-owned table (`Cart`, `Order`, `Address`, `Wishlist`, `Notification`, `RecentlyViewed`) requires the caller to pass `userId`, and the method injects `WHERE userId = :userId` into the query. A developer cannot fetch, update, or delete another customer's row through the customer-facing repositories — the filter is not optional.
- Admin repositories are intentionally unscoped (staff can see across customers), but every admin mutation records `updatedBy: staffId` and, for orders, appends an `OrderStatusHistory` row.

---

## Two Authentication Flows

| | Customer | Staff / Admin |
|---|---|---|
| Identity table | `users` | `staff_profiles` |
| Password hashing | argon2id (`core/security/password.ts`) | argon2id |
| Access token | Signed JWT, 15 min TTL, `Authorization: Bearer` | Signed JWT, 15 min TTL, `Authorization: Bearer` |
| Refresh token | Opaque, 30-day TTL, `reby_refresh_token` httpOnly cookie, path `/api/v1/auth` | Opaque, 30-day TTL, `reby_staff_refresh_token` httpOnly cookie, path `/api/v1/admin/auth` |
| Distinguishing claim | JWT `type: "customer"` | JWT `type: "staff"` (+ `role`) |
| Middleware | `requireCustomer` | `requireStaff(minRole)` |
| Scope | Own data only | Cross-customer, audited |

A customer account and a staff account are always separate rows in separate tables (`users` vs `staff_profiles`) — REBY does not allow one identity to hold both roles. Access-token JWTs are signed with `JWT_ACCESS_SECRET` and carry `{ sub: <row id>, type, email, role? }`; they are verified statelessly (no DB hit — see the tradeoff noted above). Refresh tokens are opaque 256-bit random values; only their SHA-256 hash is stored server-side (`refresh_tokens.token_hash`), so a DB leak doesn't expose usable tokens. Every refresh **rotates**: the old `RefreshToken` row is marked `revokedAt` + `replacedByTokenHash`, a new row is issued. Replaying an already-rotated (or already-logged-out) refresh token is treated as token theft and **revokes every other active refresh token for that account** (family revocation), forcing a full re-login everywhere. Customers self-register via `POST /api/v1/auth/register`; staff accounts are provisioned separately (direct DB/seed for now — no self-service staff signup) and log in via `POST /api/v1/admin/auth/login`. Both flows also enforce account lockout (5 consecutive failed logins → 15-minute lock, `failedLoginAttempts`/`lockedUntil`) and pay a constant argon2 `verify()` cost even for a nonexistent email, so login failure responses can't be used to enumerate accounts by content or timing.

---

## The Stock Commit Invariant

This is the core business rule of the commerce flow:

> **`ProductVariant.stock` only ever changes inside `inventoryService.commitOrderStock(...)` or `inventoryService.releaseOrderStock(...)`, and always in the same transaction as the `Order`/`OrderItem` write that caused it.**

1. **On order creation (checkout):** `orders.service.createOrder(...)` opens one Prisma transaction. For each line item, it row-locks the `ProductVariant`, checks `stock >= quantity`, decrements `stock`, and writes the `OrderItem`. If any line fails, the whole transaction rolls back — no partial orders, no partial stock decrements.
2. **On cancellation / payment failure / refund:** `inventoryService.releaseOrderStock(...)` re-increments `stock` for each `OrderItem` on the order, in one transaction with the `Order.status` update.
3. **Nothing else writes to `ProductVariant.stock`.** Admin stock corrections go through the same service, not direct Prisma calls.

Concurrency: variant stock updates use `SELECT ... FOR UPDATE` (via `$queryRaw` or Prisma's transaction + row lock pattern) so two simultaneous checkouts on the same variant can't oversell.

---

## Money & Quantity Types

- Money → Prisma `Decimal` (`@db.Decimal(12, 2)`), mapped to `Prisma.Decimal` / `decimal.js` in TypeScript. Never `number` for money.
- Quantities (cart/order item counts, variant stock) → `Int`. Fractional quantities don't apply to fashion retail.
- Zod schemas parse money as strings and convert to `Decimal` at the service boundary; JSON responses serialize `Decimal` as strings to preserve precision.

---

## Payment & Order State Machine

- `Payment.status`: `PENDING → SUCCEEDED | FAILED → REFUNDED`
- `Order.status`: `PENDING → CONFIRMED → PREPARING → PACKED → SHIPPED → OUT_FOR_DELIVERY → DELIVERED`, with `CANCELLED`, `RETURNED`, `REFUNDED` as exception states reachable from earlier points.
- Provider webhooks (MoMo/Airtel) are the only writers of `Payment.status` transitions after `PENDING`. Each provider adapter exposes a `handleCallback(payload)` that:
  1. Verifies the payload signature/authenticity.
  2. Looks up the `Payment` by `providerReference` (unique).
  3. If the payment is already in a terminal state, no-ops (idempotency).
  4. Otherwise updates `Payment.status` and `Order.status` in one transaction, calling `releaseOrderStock` on failure.

---

## Error Handling

- Typed errors in `core/errors/AppError.ts` (e.g. `NotFoundError`, `ValidationError`, `InsufficientStockError`, `ForbiddenError`, `UnauthorizedError`).
- A single Express error-handling middleware converts them to the response envelope: `{ "success": false, "error": { "code": ..., "message": ... } }`.
- All successful responses: `{ "success": true, "data": ... }`.
- Never leak a raw Prisma error or stack trace to the client; log it (with Sentry) and return a generic typed error instead.

---

## Migrations

- Prisma Migrate. Every schema change → a new migration (`prisma migrate dev`). Never edit the database by hand.
- Migrations are reviewed for correct indexes (especially `userId` on customer-owned tables and `variantId`/`orderId` foreign keys) before merging.

---

## Testing Strategy

- Each feature ships with tests or it is incomplete.
- A dedicated test database; each test run resets or wraps in a transaction that's rolled back.
- The non-negotiable test for every customer endpoint: **customer A cannot read or write customer B's cart, order, wishlist, or address.**
- Order/inventory tests assert the invariant: after any sequence of order creation, cancellation, and refund, `ProductVariant.stock` matches what the sequence of `OrderItem`s implies.
- Payment webhook tests assert idempotency: replaying the same callback payload twice produces the same end state, not a double-transition.
