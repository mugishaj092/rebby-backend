# Spec 13 — Cart

**Phase:** 4 — Cart & Wishlist
**Depends on:** Spec 05 (Auth), Spec 07 (Products & Variants — cart items reference variants)
**Blocks:** Spec 14 (Promo Codes on Cart), Spec 18 (Checkout reads the cart to build an order)

---

## Objective

Build the customer's shopping cart: auto-created on first item add, quantity validated against live variant stock, fully ownership-scoped. This is the first genuinely stateful customer-facing feature — get the ownership-scoping pattern exactly right here, since every later customer feature repeats it.

---

## Context

Read `references/golden-rules.md` rule 1 (ownership scoping) — this spec is the reference implementation every later customer-owned-table spec should look like. Read the `Cart`/`CartItem` blocks in `docs/schema.prisma`.

---

## Requirements

### 1. Schema

```prisma
model Cart {
  id        String   @id @default(uuid())
  userId    String   @unique @map("user_id")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  user  User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  items CartItem[]

  @@map("carts")
}

model CartItem {
  id            String   @id @default(uuid())
  cartId        String   @map("cart_id")
  productId     String   @map("product_id")
  variantId     String   @map("variant_id")
  quantity      Int
  savedForLater Boolean  @default(false) @map("saved_for_later")
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  cart    Cart           @relation(fields: [cartId], references: [id], onDelete: Cascade)
  product Product        @relation(fields: [productId], references: [id], onDelete: Cascade)
  variant ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)

  @@unique([cartId, variantId])
  @@index([cartId])
  @@map("cart_items")
}
```

Note: `couponId` on `Cart` (present in the full `docs/schema.prisma`) is **not** added in this spec — it's added in Spec 14, which owns the `Coupon` model. Adding it now would be a dangling reference.

Also add `cart Cart?` to `User` (deferred relation), and `cartItems CartItem[]` to `Product` and `ProductVariant` (Spec 07).

Run `prisma migrate dev --name add_cart`.

### 2. Repository — `features/cart/repository.ts`

- `findOrCreateCart(userId)` — the only way a `Cart` row comes into existence; called internally whenever a cart operation needs one. Use `prisma.cart.upsert` keyed on the unique `userId`, or an explicit find-then-create guarded by the unique constraint (so a race between two near-simultaneous first-adds can't create two carts for one user — the `@unique` on `userId` is the actual backstop; the upsert is just the clean way to use it).
- `findCartItem(cartId, variantId)`.
- `addOrIncrementItem(cartId, productId, variantId, quantity)` — if a `CartItem` for that `(cartId, variantId)` already exists (and isn't `savedForLater`), increment `quantity`; otherwise create a new row. Use `prisma.cartItem.upsert` on the `@@unique([cartId, variantId])` constraint.
- `updateItemQuantity(cartItemId, quantity)`.
- `removeItem(cartItemId)`.
- `getCartWithItems(userId)` — **every method in this repository that reads or mutates a cart takes `userId`, resolves the cart via `findOrCreateCart`/a `where: { userId }` lookup, and only then operates on items scoped to that cart's id.** A cart item is never fetched/updated/deleted by its own id alone without first confirming it belongs to that user's cart — this is the concrete mechanism behind "ownership scoping," not just a filter tacked onto a `findMany`.

### 3. Service — `features/cart/service.ts`

- `getCart(userId)` — returns the cart (auto-creating if it doesn't exist) with items, each item's live product/variant data (name, image, current price, current stock), and a computed `subtotal` (sum of `quantity * effective unit price`, where effective price = `variant.priceOverride ?? product.basePrice`) — **the subtotal is always computed fresh on read, never stored** (this matters again in Spec 14, where a coupon discount is applied to this same freshly-computed subtotal).
- `addItem(userId, { variantId, quantity })`:
  - Look up the variant (and its parent product). Throw `NotFoundError` if it doesn't exist or the parent product is inactive/deleted.
  - Validate `quantity > 0` and `quantity <= CART_ITEM_MAX_QUANTITY` (constant from `core/constants.ts`, e.g. 20 — matches the original product spec's cart quantity selector).
  - Validate the **resulting total quantity for that variant in the cart** (existing quantity + requested, if incrementing) does not exceed `variant.stock`. Throw `InsufficientStockError` if it does — include how many are actually available in the error `details` so the client can show a useful message.
  - Resolve/create the cart, then upsert the item.
- `updateItemQuantity(userId, cartItemId, quantity)` — same stock validation as `addItem`, but against the new absolute quantity (not additive). Must first confirm `cartItemId` belongs to a cart owned by `userId` (via the repository pattern in Requirement 2) — throw `NotFoundError` (not `ForbiddenError`) if it doesn't, so a customer can't distinguish "not yours" from "doesn't exist."
- `removeItem(userId, cartItemId)` — same ownership check.
- `toggleSavedForLater(userId, cartItemId, savedForLater: boolean)` — moves an item between the active cart view and a "saved for later" list without deleting it (per the original product spec's "Save for later" cart feature). Saved-for-later items are excluded from `getCart`'s `subtotal` and from what Spec 18's checkout considers, but returned separately (e.g. `getCart` returns `{ items, savedItems, subtotal }`).

### 4. Routes — `features/cart/routes.ts`

```
GET    /api/v1/cart                        requireCustomer
POST   /api/v1/cart/items                  requireCustomer  — { variantId, quantity }
PATCH  /api/v1/cart/items/:cartItemId      requireCustomer  — { quantity }
DELETE /api/v1/cart/items/:cartItemId      requireCustomer
PATCH  /api/v1/cart/items/:cartItemId/save requireCustomer  — { savedForLater }
```

### 5. Schema — `features/cart/schema.ts`

- `addCartItemSchema`: `variantId` (uuid), `quantity` (int, 1 to `CART_ITEM_MAX_QUANTITY`).
- `updateCartItemSchema`: `quantity` (int, 1 to `CART_ITEM_MAX_QUANTITY` — use a separate `DELETE` call to remove an item; don't allow `quantity: 0` as an implicit delete, to keep the two operations distinct and their intent explicit in logs/audits).
- `toggleSavedForLaterSchema`: `savedForLater` (boolean).

---

## Out of Scope

- Promo code application (Spec 14).
- Delivery fee/tax computation (Spec 18, checkout).
- Gift wrapping option (mentioned in the product spec; not modeled in `docs/schema.prisma` — flagged as a future schema addition, not built here).

---

## Acceptance Criteria

- [ ] A customer's first `POST /api/v1/cart/items` call auto-creates their cart — no separate "create cart" step exists or is needed.
- [ ] Adding the same variant twice increments quantity on the existing `CartItem` rather than creating a duplicate row.
- [ ] Adding a quantity that would exceed `variant.stock` (either as a fresh add or as an increment past the limit) is rejected with `InsufficientStockError`, including the available quantity in the error details.
- [ ] `GET /api/v1/cart` always returns a freshly computed `subtotal` — verified by changing `basePrice` directly in the DB between two calls and confirming the second call reflects the new price.
- [ ] Customer A can never read, update, or delete an item in customer B's cart — attempting to do so (with a real `cartItemId` belonging to B) returns `NotFoundError`, not the item data and not a 403.
- [ ] Toggling `savedForLater` moves the item out of the cart's active `items`/`subtotal` and into `savedItems`, without deleting the row.
- [ ] `npm run typecheck` and the test suite pass.

## Test Requirements

- Auto-creation test: first add creates both `Cart` and `CartItem` in one call.
- Increment-not-duplicate test: adding the same variant twice results in one row with summed quantity.
- Stock-boundary tests: exactly at `variant.stock` succeeds; one over is rejected; incrementing an existing quantity past the limit is rejected even though the individual add request's quantity alone would be fine.
- Fresh-subtotal test: change `basePrice` between two `getCart` calls, confirm the second reflects it.
- **Ownership-scoping test (the most important one in this spec):** customer A attempts to update/delete/read a `cartItemId` that belongs to customer B's cart — assert `NotFoundError` in every case, and assert B's cart is completely unaffected by A's attempt.
- Saved-for-later toggle test: item excluded from `subtotal` when saved, included when unsaved, never deleted.
