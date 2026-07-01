# State Machines

## Order status

```
PENDING → CONFIRMED → PREPARING → PACKED → SHIPPED → OUT_FOR_DELIVERY → DELIVERED
                ↘ CANCELLED / RETURNED / REFUNDED (exception states, reachable from earlier points)
```

- `PENDING → CANCELLED`: customer-initiated, allowed only while `status = PENDING`. Calls `releaseOrderStock`.
- `CONFIRMED` is reached only when `Payment.status` becomes `SUCCEEDED` (or COD is accepted).
- Every transition appends an `OrderStatusHistory` row: `fromStatus`, `toStatus`, `changedByStaffId` (null if system/customer-initiated), timestamp. Never overwritten in place — this is the audit trail.
- Invalid transitions (e.g. `DELIVERED → PENDING`, skipping states backward) are rejected by the service layer, not left to the caller to avoid.

## Payment status

```
PENDING → SUCCEEDED | FAILED → REFUNDED
```

- `PENDING` is set at order creation (`orders.service.createOrder`).
- Only two things write transitions after `PENDING`:
  1. A provider webhook handler (`features/payments/providers/momo.ts` / `airtel.ts`) via `handleCallback(payload)`.
  2. The COD "mark delivered" admin action, which flips `COD` payments straight to `SUCCEEDED`.
- `FAILED` triggers `releaseOrderStock` and `Order.status = CANCELLED` in the same transaction as the `Payment` update.
- `REFUNDED` is set by the refund flow (`features/payments/service.ts` refund path), which also calls `releaseOrderStock` if the returned item is restockable.

## Idempotency requirement

Every webhook handler:
1. Verifies payload authenticity.
2. Looks up `Payment` by unique `providerReference`.
3. If already terminal (`SUCCEEDED`/`FAILED`/`REFUNDED`), no-ops and returns success (the provider will retry deliveries — a 200 must be returned even on the no-op path).
4. Otherwise transitions `Payment` + `Order` status together in one transaction.
