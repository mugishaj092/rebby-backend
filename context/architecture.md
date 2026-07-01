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
| Auth | Clerk (customer + staff sessions, distinguished by role) |
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
      requireCustomer.ts   # verifies Clerk session → attaches req.user
      requireStaff.ts      # verifies Clerk session + role → attaches req.staff
      errorHandler.ts      # converts typed errors to the response envelope
      responseEnvelope.ts
      rateLimit.ts
    errors/
      AppError.ts          # base + typed errors (NotFoundError, InsufficientStock, ...)
    utils/
    validation/
      pagination.ts        # shared Zod schemas

  db/
    prisma.ts              # PrismaClient singleton

  features/                # ← every feature is a self-contained vertical slice
    auth/
      routes.ts
      controller.ts
      service.ts            # Clerk webhook handling, profile sync
      schema.ts
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
- `requireCustomer` — verifies the Clerk session, loads/creates the corresponding `User` row, attaches `req.user`. Used on all customer routes (cart, wishlist, orders, etc.).
- `requireStaff(minRole)` — verifies the Clerk session, requires a matching `StaffProfile` row with `role >= minRole` (`STAFF < MANAGER < OWNER`), attaches `req.staff`. Used on all `/admin` routes.
- A route is never left without one of these two (or an explicit `public` marker for genuinely public catalog-browsing routes).

### 2. Repository-level ownership scoping
- Every repository method touching a customer-owned table (`Cart`, `Order`, `Address`, `Wishlist`, `Notification`, `RecentlyViewed`) requires the caller to pass `userId`, and the method injects `WHERE userId = :userId` into the query. A developer cannot fetch, update, or delete another customer's row through the customer-facing repositories — the filter is not optional.
- Admin repositories are intentionally unscoped (staff can see across customers), but every admin mutation records `updatedBy: staffId` and, for orders, appends an `OrderStatusHistory` row.

---

## Two Authentication Flows

| | Customer | Staff / Admin |
|---|---|---|
| Identity table | `users` | `staff_profiles` |
| Clerk session | Yes | Yes |
| Distinguishing claim | Clerk `publicMetadata.role` absent or `"customer"` | Clerk `publicMetadata.role` = `"staff"` \| `"manager"` \| `"owner"` |
| Middleware | `requireCustomer` | `requireStaff(minRole)` |
| Scope | Own data only | Cross-customer, audited |

A staff Clerk account and a customer Clerk account are always different Clerk users — REBY does not allow one identity to hold both roles. Middleware rejects a request if the session's role doesn't match what the route requires.

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
