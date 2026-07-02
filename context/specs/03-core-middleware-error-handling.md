# Spec 03 — Core Middleware & Error Handling

**Phase:** 1 — Foundation
**Depends on:** Spec 01 (Project Skeleton)
**Blocks:** every feature spec (all of them use the error envelope and typed errors)

---

## Objective

Build the shared error-handling and response-envelope machinery every feature will rely on: typed application errors, an Express error-handling middleware that converts them into the standard envelope, a response-envelope helper for success responses, and a Zod-based request validation middleware.

---

## Context

Read `references/errors-and-envelope.md` for the exact envelope shape and the typed-error table this spec must implement. Read `docs/code-standards.md` (Error Handling section).

---

## Requirements

### 1. Typed application errors — `src/core/errors/AppError.ts`

- A base `AppError` class extending `Error`, carrying `statusCode: number` and `code: string`.
- Concrete subclasses, matching `references/errors-and-envelope.md` exactly:

| Class | statusCode | code |
|---|---|---|
| `NotFoundError` | 404 | `NOT_FOUND` |
| `ValidationError` | 422 | `VALIDATION_ERROR` |
| `InsufficientStockError` | 409 | `INSUFFICIENT_STOCK` |
| `ForbiddenError` | 403 | `FORBIDDEN` |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` |
| `ConflictError` | 409 | `CONFLICT` |

- Each constructor accepts a human-readable `message` and, where relevant, an optional `details` payload (e.g. `ValidationError` carries field-level Zod issues).
- Do not add error classes beyond this table without updating `references/errors-and-envelope.md` first — this list is the contract every later spec relies on.

### 2. Response envelope helper — `src/core/middleware/responseEnvelope.ts`

- A small helper (function or `res` extension) for success responses: `sendSuccess(res, data, statusCode = 200)` → `{ success: true, data }`.
- Controllers use this helper rather than calling `res.json(...)` with an ad hoc shape.

### 3. Error-handling middleware — `src/core/middleware/errorHandler.ts`

- A standard 4-arg Express error middleware, registered **last** in `app.ts`.
- If the error is an `AppError` (or subclass): respond with its `statusCode` and `{ success: false, error: { code, message, details? } }`.
- If the error is anything else (unexpected/unhandled): log it in full (with Sentry once wired — a `// TODO(later spec): Sentry.captureException` marker is fine here since Sentry setup isn't part of this spec), and respond `500` with a generic `{ success: false, error: { code: "INTERNAL_ERROR", message: "Something went wrong." } }`. **Never** leak a raw stack trace, Prisma error, or driver error message to the client.
- Log every handled `AppError` too, with a context prefix pattern: `logger.error('[<context>] <message>')` — establish a minimal `logger` (can be a thin `console` wrapper for now) in `core/utils/logger.ts`.

### 4. Request validation middleware — `src/core/middleware/validate.ts`

- A `validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body')` middleware factory.
- Parses the specified request part through the schema; on failure, throws `ValidationError` with the Zod issues attached as `details` (caught by the error handler, not handled inline).
- On success, replaces `req[source]` with the parsed (and thus typed/coerced) result.

### 5. Wire into `app.ts`
- Update `src/app.ts` (created in Spec 01) to register `errorHandler` as the last middleware.
- Remove the `// TODO(spec 03)` marker left in Spec 01.

---

## Out of Scope

- Sentry integration itself (later spec) — only leave the marker comment.
- `requireCustomer` / `requireStaff` auth middleware (Spec 05).
- Rate limiting (mentioned in `architecture.md` but not required for this spec).

---

## Acceptance Criteria

- [ ] A route that throws `NotFoundError('Order not found')` returns HTTP 404 with `{ "success": false, "error": { "code": "NOT_FOUND", "message": "Order not found" } }`.
- [ ] A route that throws a plain, unexpected `Error` returns HTTP 500 with the generic `INTERNAL_ERROR` envelope — no stack trace or internal detail in the response body.
- [ ] `validate(schema)` on a route rejects a malformed request body with a 422 `VALIDATION_ERROR` response including field-level `details`.
- [ ] A successful controller response via `sendSuccess` matches `{ "success": true, "data": ... }` exactly.
- [ ] All six typed error classes exist and are exported from `core/errors/AppError.ts`.
- [ ] `npm run typecheck` and `npm run lint` still pass.

## Test Requirements

- Unit tests instantiating each typed error and asserting its `statusCode`/`code`.
- Supertest integration tests against a small test route (added temporarily to the test app, not to production routes) that throws each error type and asserts the resulting HTTP status + envelope shape.
- A test proving an unhandled, non-`AppError` exception still produces a clean 500 envelope, not a raw crash or stack trace leak.
- A test for `validate(...)` middleware: valid payload passes through with `req.body` replaced by the parsed value; invalid payload throws `ValidationError`.
