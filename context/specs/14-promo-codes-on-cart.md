# Spec 14 — Promo Codes on Cart

**Phase:** 4 — Cart & Wishlist
**Depends on:** Spec 13 (Cart)
**Blocks:** Spec 18 (Checkout — the applied coupon carries through to order creation), Spec 32 (Admin Promotions Management extends this model)

---

## Objective

Add the `Coupon` model and let a customer apply/remove a promo code on their cart, with every validation rule (active window, minimum spend, usage limit) enforced server-side — the discount amount shown to the client is always recomputed from the coupon's rules against the current cart, never trusted from the client and never cached/stored stale on the cart itself.

---

## Context

Read Spec 13 (Cart) in full — this spec modifies `Cart` (adds `couponId`) and extends `cart.service.getCart` to fold in discount computation. Read `references/golden-rules.md` rule 3 (money = `Decimal`).

---

## Requirements

### 1. Schema

```prisma
model Coupon {
  id          String     @id @default(uuid())
  code        String     @unique @db.VarChar(50)
  type        CouponType
  value       Decimal    @db.Decimal(12, 2)
  minSpend    Decimal?   @map("min_spend") @db.Decimal(12, 2)
  usageLimit  Int?       @map("usage_limit")
  usageCount  Int        @default(0) @map("usage_count")
  startsAt    DateTime?  @map("starts_at") @db.Timestamptz(6)
  endsAt      DateTime?  @map("ends_at") @db.Timestamptz(6)
  isActive    Boolean    @default(true) @map("is_active")
  createdAt   DateTime   @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime   @updatedAt @map("updated_at") @db.Timestamptz(6)

  carts Cart[]

  @@map("coupons")
}

enum CouponType {
  percentage
  fixed
  free_delivery

  @@map("coupon_type")
}
```

Add `couponId String? @map("coupon_id")` and `coupon Coupon? @relation(fields: [couponId], references: [id], onDelete: SetNull)` to the `Cart` model from Spec 13 — this is the deferred relation flagged in that spec.

Run `prisma migrate dev --name add_coupons`.

**Note on `usageCount`:** this is a running total incremented when a coupon is actually **consumed** (i.e. an order is placed with it, which happens in Spec 18/Checkout) — not when it's merely *applied* to a cart. Applying a coupon to a cart is provisional and reversible (the customer can remove it, abandon the cart, or the cart can be edited); only order creation should increment `usageCount`. This spec builds the apply/remove/preview logic; **the increment-on-order-creation itself is Spec 18's responsibility** and is called out again there so it isn't forgotten.

### 2. Repository — `features/cart/repository.ts` (extend)

- `findCouponByCode(code)` — case-insensitive lookup (`WHERE UPPER(code) = UPPER($1)`, or normalize/store codes uppercase and normalize input the same way at write and read time — pick one and be consistent; recommended: store and compare uppercase).
- `setCartCoupon(cartId, couponId | null)`.

### 3. Service — `features/cart/service.ts` (extend)

- `validateCoupon(coupon, cartSubtotal)` — a pure function (no DB access) returning either `{ valid: true, discount: Decimal }` or `{ valid: false, reason: string }`, checking in order:
  1. `isActive === true`
  2. current time is within `[startsAt, endsAt]` (treat null bounds as unbounded on that side)
  3. `usageLimit` is null or `usageCount < usageLimit`
  4. `minSpend` is null or `cartSubtotal >= minSpend`
  - Discount calculation: `percentage` → `subtotal * (value / 100)`, capped so discount never exceeds the subtotal itself; `fixed` → `min(value, subtotal)`; `free_delivery` → discount is `0` against the subtotal (it zeroes the delivery fee instead, which is computed at checkout in Spec 18 — this spec's cart-level discount for a `free_delivery` coupon is correctly `0`, and the actual delivery-fee waiver is Spec 18's concern; note this so it isn't mistaken for a bug).
- `applyCoupon(userId, code)`:
  - Look up the coupon by code. Not found → `NotFoundError` with a generic "Invalid promo code" message (don't reveal whether the code once existed and expired vs never existed).
  - Compute the cart's current subtotal (reusing `getCart`'s subtotal logic — don't duplicate it).
  - Run `validateCoupon`. If invalid, throw `ValidationError` with the specific `reason` (this is fine to be specific here, unlike login — an invalid promo code isn't a security-sensitive enumeration concern the way login is).
  - `setCartCoupon(cartId, coupon.id)`.
- `removeCoupon(userId)` — `setCartCoupon(cartId, null)`. No-op (not an error) if no coupon was applied.
- Extend `getCart(userId)` (from Spec 13) to, when `cart.couponId` is set: re-fetch the coupon, re-run `validateCoupon` against the **current** subtotal, and include `{ coupon: { code, type, value }, discount, total: subtotal - discount }` in the response. **If re-validation now fails** (e.g. the cart dropped below `minSpend` after an item was removed, or the coupon expired while sitting applied), automatically clear it (`setCartCoupon(cartId, null)`) and surface a `couponRemoved: { reason }` note in the response rather than silently keeping a stale/invalid discount applied or erroring the whole cart fetch.

### 4. Routes — `features/cart/routes.ts` (extend)

```
POST   /api/v1/cart/coupon   requireCustomer  — { code }
DELETE /api/v1/cart/coupon   requireCustomer
```

### 5. Schema — `features/cart/schema.ts` (extend)

- `applyCouponSchema`: `code` (string, 1–50 chars).

---

## Out of Scope

- Admin coupon management (create/edit/deactivate coupons) — Spec 32.
- Incrementing `usageCount` — Spec 18 (order creation), called out above.
- Per-customer usage limits (e.g. "one use per customer") — the schema only supports a global `usageLimit`; per-customer limits would need an additional join table and are flagged as a future enhancement, not built here.

---

## Acceptance Criteria

- [ ] Applying a valid, active, in-window coupon that meets `minSpend` succeeds and `getCart` reflects the discount and new total.
- [ ] Applying an expired coupon, a not-yet-started coupon, an inactive coupon, a usage-limit-exhausted coupon, or a below-`minSpend` cart each fail with a clear, specific reason.
- [ ] The discount shown is always computed server-side from the coupon's current rules and the cart's current subtotal — never accepted from or trusted to a client-supplied value.
- [ ] Removing an item that drops the cart below the applied coupon's `minSpend` causes the coupon to be automatically cleared on the next `getCart` call, with a clear indication why.
- [ ] `DELETE /api/v1/cart/coupon` on a cart with no coupon applied is a no-op, not an error.
- [ ] `free_delivery` coupons produce a `0` cart-level discount (correctly deferring the actual waiver to checkout).
- [ ] Coupon code lookup is case-insensitive (`save10` and `SAVE10` both work).

## Test Requirements

- Happy-path apply test with subtotal/discount/total verified numerically for each `CouponType`.
- One test per rejection reason (expired, not-started, inactive, usage-limit-exhausted, below-min-spend).
- Auto-clear-on-revalidation test: apply a coupon near the `minSpend` boundary, remove an item to drop below it, confirm the next `getCart` call clears the coupon and reports why.
- Case-insensitivity test.
- A test confirming a manually crafted/forged discount value in a hypothetical client request has no effect — i.e. confirm there's no code path where a client-supplied discount is ever accepted (this is really a code-structure/API-surface check: the apply endpoint only ever accepts `code`, never an amount).
