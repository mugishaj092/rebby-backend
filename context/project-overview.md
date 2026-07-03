# Project Overview

## About the Project

**REBY** is a premium fashion e-commerce platform built for Africa, starting with Rwanda. Customers browse a curated catalog, build a cart, check out with local payment methods (MTN MoMo, Airtel Money, or Cash on Delivery), and track their orders end to end. Store operators manage products, inventory, orders, and promotions through an admin dashboard.

This is a **single-store platform** (one storefront, one catalog) — not multi-tenant. There is no business-to-business account isolation to design around; the isolation that matters here is between a **customer's own data** (their cart, orders, addresses) and **everyone else's**, and between **customer access** and **admin access**.

This first build covers the **commerce core**: catalog, cart, checkout, orders, and payments — the foundation the rest of the platform (promotions, richer admin reporting, reviews) will sit on.

---

## The Two Access Levels

| Level | Who | Can do |
|---|---|---|
| **Customer** | Anyone shopping on the mobile app | Browse, buy, track their own orders, manage their own profile/wishlist |
| **Staff / Admin** | People running the store | Manage products, inventory, orders, promotions, and view business reports |

Both authenticate via **email + password** (argon2id-hashed, short-lived access-token JWTs + rotating httpOnly-cookie refresh tokens), but are treated as two distinct access levels in the API:

- A customer's access token maps to a `User` row.
- A staff member's access token maps to a `StaffProfile` row carrying a `role` (`OWNER`, `MANAGER`, `STAFF`).
- Every route is explicitly customer-only, staff-only, or public — never ambiguous. A customer session can never reach an admin route and vice versa, enforced by dedicated middleware (`requireCustomer`, `requireStaff(minRole)`), not by convention.

---

## Core Concept: Ownership Scoping

Every customer-owned row (`Cart`, `Order`, `Address`, `Wishlist`, `RecentlyViewed`, `Notification`) carries a `userId`. **Every query on these tables filters by the authenticated user's own id.** A customer must never be able to read or act on another customer's cart, order, or address by guessing an id.

Admin routes are the exception: staff can read/act across all customers' orders and data (that's the job), but every admin-mutating action is written to an audit trail (`updatedBy` / order status history) so changes are traceable to a specific staff member.

---

## Modules (this build)

```
Auth            → customer auth (email + password + JWT), staff auth (email + password + JWT + role), profile
Catalog         → categories, collections, products, variants, banners
Discovery       → search, filtering, sorting, recently viewed
Cart            → cart, cart items, promo code application
Wishlist        → saved products, price-drop / back-in-stock intent
Checkout        → order creation, one-page checkout flow
Orders          → order lifecycle, status history, invoices
Payments        → MoMo / Airtel / COD integration, refunds
Notifications   → push notification dispatch (order + marketing)
Admin           → dashboard metrics, product/order/customer management, reports
Support         → return/refund requests
```

---

## Core Flows

### Customer Shopping
- Customer signs in (or browses as guest for discovery-only).
- Adds items to cart — cart is persisted server-side once authenticated.
- Applies a promo code (validated server-side, never trusted from the client).
- Checks out: address → delivery option → payment method → review → confirm.

### Order Creation & Stock
- On order creation, the checkout service opens **one transaction**: create `Order` + `OrderItem`s, validate and decrement `ProductVariant.stock` for each line, create the initial `Payment` row (`PENDING`), and clear the ordered items from the cart.
- **Stock is never touched outside this transaction.** The single choke point is `inventoryService.commitOrderStock(...)`.
- If MoMo/Airtel payment fails or times out, stock already decremented at order-creation is released back by a cancellation job — see `architecture.md` for the reservation-and-release rule.

### Payment Flow
```
Order created (PENDING)
   → Payment initiated (MoMo/Airtel STK push, or COD marked collectible)
   → Provider webhook / callback confirms
   → Payment.status = SUCCEEDED  →  Order.status = CONFIRMED
   → (or) Payment.status = FAILED → Order.status = CANCELLED, stock released
```
- Webhook handlers are **idempotent** — a MoMo/Airtel callback replayed twice must not double-confirm an order or double-adjust stock. Enforced via a unique `providerReference` on `Payment`.

### Order Lifecycle
```
PENDING → CONFIRMED → PREPARING → PACKED → SHIPPED → OUT_FOR_DELIVERY → DELIVERED
                                                              ↘ CANCELLED / RETURNED / REFUNDED
```
- Every status change is appended to an `OrderStatusHistory` row (who changed it, when, from/to) — never overwritten in place.

### Admin Product & Inventory Management
- Staff create/edit products with variants (size × color, each carrying its own stock count and optional price override).
- Low-stock and out-of-stock views are computed reads over `ProductVariant.stock`, not separately maintained counters.

---

## Screens → Tables

| Screen | Table(s) |
|---|---|
| Categories | `categories` |
| Products | `products`, `product_images`, `product_variants` |
| Collections & Banners | `collections`, `banners` |
| Cart | `carts`, `cart_items` |
| Wishlist | `wishlists`, `wishlist_items` |
| Checkout / Orders | `orders`, `order_items`, `order_status_history` |
| Payments | `payments`, `refunds` |
| Addresses | `addresses` |
| Notifications | `notifications` |
| Promotions | `coupons` |
| Admin — Customers | `users`, `orders` (aggregated) |

---

## In Scope (this build)

- Customer auth (email + password + JWT) + staff auth (email + password + JWT + role) with strict access-level separation
- Catalog: categories, collections, products, variants, banners
- Search, filtering, sorting, recently viewed
- Cart with promo code application
- Wishlist
- One-page checkout, order creation with transactional stock commit
- Payments: MTN MoMo, Airtel Money, Cash on Delivery (card is future)
- Order lifecycle with status history
- Push notifications (order updates + basic promotions)
- Admin dashboard: products, inventory, orders, customers, promotions, reports
- Return/refund requests

## Out of Scope (later builds)

- Card payments (Visa/Mastercard)
- Live chat support
- Multi-currency, multi-language
- Loyalty points, referral program, gift cards
- Courier/map tracking integrations
- Product reviews & ratings (schema reserved, not built)
- Voice search, 360° product images, product video

---

## Target User

- **Customer** — browses and buys on the mobile app.
- **Store owner / manager** — oversees the whole business via the admin dashboard.
- **Store staff** — manages day-to-day product and order operations.

---

## Success Criteria

- A customer can go from browsing to a confirmed order without leaving the app.
- A customer can never read or modify another customer's cart, order, or address — verified by tests.
- Stock is only ever adjusted through `commitOrderStock` / `releaseOrderStock`; it can always be reconciled against order line items.
- A MoMo/Airtel webhook replayed twice does not double-confirm an order or double-decrement stock.
- Every order status change is auditable (who, when, from → to).
- All money values are exact — no floating-point drift.
- Staff routes are completely unreachable with a customer session, and vice versa.
