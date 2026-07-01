# Build Plan

The ordered list of features to build. Each task is small, self-contained, and testable. Build them **in order** — later tasks depend on earlier ones. Complete one fully (code + test + progress-tracker update) before starting the next.

Each task lists: what to build, and how to verify it.

---

## Phase 1 — Foundation

### 01 Project Skeleton
Set up the Express app: `app.ts` (app factory, middleware registration), `server.ts` (boot), `config/env.ts` (Zod-validated env loading), folder structure per `architecture.md`, `tsconfig.json` (strict), ESLint + Prettier config.
**Verify:** `npm run dev` boots; `GET /health` returns `{ "success": true, "data": { "status": "ok" } }`.

### 02 Prisma Setup & Base Schema
`prisma/schema.prisma` with the datasource/generator blocks and shared enums (`OrderStatus`, `PaymentStatus`, `PaymentProvider`, `StaffRole`). `db/prisma.ts` — single `PrismaClient` singleton.
**Verify:** `prisma generate` runs clean; `prisma migrate dev` creates an empty initial migration with no errors.

### 03 Core Middleware & Error Handling
`core/errors/AppError.ts` (typed exceptions), `core/middleware/errorHandler.ts`, `core/middleware/responseEnvelope.ts`, `core/middleware/validate.ts` (Zod request validation).
**Verify:** a route that throws `NotFoundError` returns the correct envelope and status code; unit tests for the envelope shape.

### 04 Identity Models + Migration
`User`, `StaffProfile`, `Address` models in `schema.prisma`. Generate + run the migration.
**Verify:** tables exist in Postgres with correct columns, FKs, and indexes.

### 05 Auth Integration (Clerk)
`features/auth/` — Clerk webhook handler (user created/updated → sync `User` row), `core/middleware/requireCustomer.ts`, `core/middleware/requireStaff.ts`.
**Verify:** a valid customer Clerk session reaches a protected route and `req.user` is populated; an invalid/missing session is rejected with 401; a customer session is rejected on a staff-only route with 403.

---

## Phase 2 — Catalog

### 06 Categories
`features/catalog/` — `Category` model (self-referencing `parentId`), CRUD (staff-only for writes, public for reads), migration.
**Verify:** nested categories creatable; public read works without auth; write requires staff.

### 07 Products & Variants
`Product`, `ProductImage`, `ProductVariant` models + migration. Staff CRUD for products with nested variant creation (size/color/stock/optional price override).
**Verify:** create a product with 3 variants in one call; duplicate SKU rejected; soft-delete hides from public listing but preserves for existing orders.

### 08 Collections & Banners
`Collection`, `Banner` models + migration + staff CRUD + public read endpoints (home screen sections).
**Verify:** a collection can reference a set of products; banners have an active date range and only active ones return from the public endpoint.

### 09 Product Detail & Public Listing
Public endpoints: list products (paginated), get product detail (with images, variants, category), list by category/collection.
**Verify:** product detail includes all variants with live stock; pagination params respected.

---

## Phase 3 — Discovery

### 10 Search
`features/discovery/` — text search across product name/description (Postgres `ILIKE` or `tsvector`), search-by-SKU.
**Verify:** search returns relevant results; SKU search is exact-match.

### 11 Filtering & Sorting
Filter params: category, size, color, price range, availability, new-arrivals, on-sale. Sort params: newest, price asc/desc, best-selling (computed from order counts), most popular.
**Verify:** combined filters (category + size + price range) return the correct intersection; each sort order produces correctly ordered results.

### 12 Recently Viewed
`RecentlyViewed` model + migration + service to record a view (dedupe per user+product, cap list length) + endpoint to list a customer's recently viewed.
**Verify:** viewing the same product twice doesn't duplicate the entry; list is capped and ordered by most recent.

---

## Phase 4 — Cart & Wishlist

### 13 Cart
`Cart`, `CartItem` models + migration. Add/update/remove item, get current cart (auto-created on first add), quantity validation against live stock.
**Verify:** adding more than available stock is rejected; a customer can only ever see/modify their own cart (ownership-scoping test).

### 14 Promo Codes on Cart
`Coupon` model + migration. Apply/remove promo code on cart; server-side validation (active window, min spend, usage limit) — never trust a client-sent discount amount.
**Verify:** expired/invalid code rejected; discount recalculated server-side on every cart fetch, not stored stale.

### 15 Wishlist
`Wishlist`, `WishlistItem` models + migration. Add/remove/list wishlist items.
**Verify:** ownership-scoped; adding a duplicate product is a no-op, not an error.

---

## Phase 5 — Checkout & Orders

### 16 Order & Payment Models
`Order`, `OrderItem`, `OrderStatusHistory`, `Payment` models + migration. `Order.status` and `Payment.status` enums per `architecture.md`.
**Verify:** tables + FKs + indexes (`userId` on `Order`, `orderId` on `OrderItem`/`Payment`) exist.

### 17 Inventory Choke Point
`features/inventory/service.ts` → `commitOrderStock(tx, items)` and `releaseOrderStock(tx, orderId)`. Row-locks variant stock; throws `InsufficientStockError` if any line is short.
**Verify:** concurrent checkout attempts on the same low-stock variant — only as many succeed as there is stock for; `releaseOrderStock` restores exactly what `commitOrderStock` took.

### 18 Checkout — Order Creation
`orders.service.createOrder(...)`: one transaction — validate cart, `commitOrderStock`, create `Order` + `OrderItem`s, create initial `Payment` (`PENDING`), clear ordered cart items, write the initial `OrderStatusHistory` row.
**Verify:** a successful checkout leaves cart empty of ordered items, stock decremented, order + payment rows created together; a failure on any line rolls back all of it (no partial order).

### 19 Order Read Endpoints
Customer: list own orders, get order detail, download invoice (simple PDF or structured JSON — MVP can be JSON). Track order (status + `OrderStatusHistory` timeline).
**Verify:** ownership-scoped; another customer's order id returns 404, not 403 (don't leak existence).

### 20 Order Cancellation
Customer can cancel while `status = PENDING`. Cancellation calls `releaseOrderStock` and updates `Payment.status` if still pending.
**Verify:** cancelling after `CONFIRMED` is rejected; cancelling `PENDING` restores stock and appends status history.

---

## Phase 6 — Payments

### 21 MoMo & Airtel Provider Adapters
`features/payments/providers/momo.ts`, `airtel.ts` — initiate payment (STK push equivalent), `handleCallback(payload)` per provider.
**Verify:** initiate call returns a pending reference; a mocked provider callback in a test environment transitions `Payment.status` correctly.

### 22 Payment Webhook Idempotency
Webhook route verifies payload authenticity, looks up `Payment` by unique `providerReference`, no-ops if already terminal, otherwise transitions `Payment` + `Order` status in one transaction (calling `releaseOrderStock` on failure).
**Verify:** replaying the identical callback payload twice produces the same end state — no double-confirmation, no double stock release.

### 23 Cash on Delivery
COD payment path: `Payment` created with provider `COD`, status `PENDING`, marked `SUCCEEDED` on delivery confirmation (admin action) rather than a provider callback.
**Verify:** COD order proceeds through the lifecycle without a provider webhook; marking delivered flips payment to `SUCCEEDED`.

### 24 Refunds
`Refund` model + migration. Staff-initiated refund on a delivered/returned order; on approval, calls `releaseOrderStock` if the item is restockable, updates `Payment.status = REFUNDED`.
**Verify:** refund amount cannot exceed the order total; stock restored only for items marked returnable.

---

## Phase 7 — Notifications & Background Jobs

### 25 Push Notification Service
`features/notifications/service.ts` — `sendPush(userId, template, data)`, `Notification` model + migration (persisted history alongside the push send).
**Verify:** sending a push writes a `Notification` row; a user with no registered device token fails gracefully (logged, not thrown).

### 26 Order Status Notifications
Wire notification sends into order status transitions (confirmed, shipped, out for delivery, delivered, cancelled).
**Verify:** each transition in the order lifecycle triggers exactly one notification of the correct template.

### 27 Unpaid Order Release Job
BullMQ job (`jobs/releaseUnpaidOrders.ts`): finds orders `PENDING` past a timeout with no successful payment, cancels them and releases stock.
**Verify:** an order past the timeout is auto-cancelled and its stock restored; an order that received payment just before the job runs is left alone (race-safe).

### 28 Price-Drop & Back-in-Stock Alerts
BullMQ jobs comparing current price/stock against wishlist entries; sends notifications on drop/restock.
**Verify:** a price drop on a wishlisted product triggers one notification per watching customer, not a duplicate on every job run.

---

## Phase 8 — Admin

### 29 Admin Dashboard Metrics
`features/admin/` — revenue, order counts, sales chart data, best sellers, low-stock/out-of-stock counts, new customers, pending refunds. All staff-only.
**Verify:** numbers reconcile against raw order/payment data for a seeded date range.

### 30 Admin Order Management
List/filter all orders, update status (writes `OrderStatusHistory`), print invoice, cancel, refund.
**Verify:** a staff-initiated status change is attributed to that staff member in history; invalid transitions (e.g. `DELIVERED → PENDING`) are rejected.

### 31 Admin Customer Management
Customer profiles, purchase history, lifetime spend, order frequency — staff read-only view over customer + order data.
**Verify:** lifetime spend matches the sum of that customer's completed order totals.

### 32 Promotions Management
Staff CRUD for `Coupon` (percentage/fixed discounts, free-delivery campaigns, usage limits, active windows).
**Verify:** overlapping/duplicate codes rejected; deactivating a coupon immediately stops it applying to new carts.

---

## Phase 9 — Support & Hardening

### 33 Return & Refund Requests
`features/support/` — customer submits a return/refund request against a delivered order; staff review queue (approve → triggers Phase 6 refund flow, or reject).
**Verify:** a request can only be filed against a `DELIVERED` order within a return window; approval hands off correctly to the refund flow.

### 34 Ownership & Invariant Test Sweep
A full test pass: every customer endpoint enforces ownership scoping; the stock invariant holds after a randomized sequence of checkout/cancel/refund operations; payment webhook idempotency re-verified end to end.
**Verify:** suite green; a property-style test of mixed operations keeps `ProductVariant.stock` reconcilable against `OrderItem` history.

### 35 OpenAPI & Seed Script
Clean tags/summaries on every endpoint; a seed script populating demo categories, products with variants, a few orders in different statuses, for manual testing.
**Verify:** API docs are complete and readable; seed script produces a working demo storefront.
