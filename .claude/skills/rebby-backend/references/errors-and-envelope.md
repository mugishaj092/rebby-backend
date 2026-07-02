# Response Envelope & Errors

## Envelope

```json
// success
{ "success": true, "data": { ... } }

// error
{ "success": false, "error": { "code": "INSUFFICIENT_STOCK", "message": "..." } }
```

Applied consistently by the shared error-handling middleware (`core/middleware/errorHandler.ts`), registered last in the Express middleware chain. Never return a raw object/array at the top level from a controller.

## Typed errors (`core/errors/AppError.ts`)

| Error | HTTP status | When |
|---|---|---|
| `NotFoundError` | 404 | resource missing, or exists but not owned by the caller (don't leak existence — same status either way) |
| `ValidationError` | 422 | Zod schema failure, surfaced with field-level detail |
| `InsufficientStockError` | 409 | `commitOrderStock` can't satisfy a line item |
| `ForbiddenError` | 403 | wrong access level for the route (e.g. customer session on a staff route) |
| `UnauthorizedError` | 401 | missing/invalid Clerk session |
| `ConflictError` | 409 | invalid order status transition, duplicate coupon code, etc. |

## Rules

- Controllers never construct raw HTTP error responses — they call `next(err)` and let the error middleware convert typed errors.
- Services throw typed errors; they never construct `HTTPException`-style objects or write to `res` directly.
- Never leak a raw Prisma or driver error to the client — log it (with Sentry, prefixed `[feature.service.function]`) and return the corresponding typed error instead.
- Never use an empty `catch` block — catch specifically, rethrow typed errors.
