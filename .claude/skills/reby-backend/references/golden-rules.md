# Golden Rules

Non-negotiable. If a task seems to require breaking one of these, stop and flag it instead of proceeding.

1. **Ownership scoping** — every query on `Cart`, `Order`, `Address`, `Wishlist`, `RecentlyViewed`, `Notification` takes `userId` and filters by it. No exceptions.
2. **Stock choke point** — `ProductVariant.stock` changes only inside `inventory.service.commitOrderStock(...)` / `releaseOrderStock(...)`, in the same transaction as the `Order`/`OrderItem` write that caused it. Nothing else writes to `stock`.
3. **Money = `Decimal`** (`@db.Decimal(12, 2)` in Prisma, `Prisma.Decimal` in TypeScript), never `number`. Quantities = `Int`.
4. **Payment webhooks are idempotent** — look up `Payment` by unique `providerReference`; no-op if already in a terminal state (`SUCCEEDED`/`FAILED`/`REFUNDED`) before transitioning anything.
5. **Customer vs staff routes never mix.** Every route uses exactly one of `requireCustomer`, `requireStaff(minRole)`, or is explicitly marked public.
6. **Scope is sacred** — build only what the current `build-plan.md` task specifies. Don't add fields, endpoints, or features "while you're here."
7. **Every feature ships with a test.** Untested is unfinished — include the ownership-scoping test for customer features, the stock invariant test for order/inventory features, and the idempotency (replay) test for payment webhook features.
8. **Concurrency on stock** — variant stock updates use row-level locking (`SELECT ... FOR UPDATE` via `$queryRaw`, or Prisma transaction isolation) so two simultaneous checkouts on the same variant can't oversell.
