# Code Standards

Implementation rules for the entire project. The AI agent must follow these in every session without exception. These rules prevent pattern drift across sessions.

---

## Engineering Mindset

- **Think before implementing** — understand what is being built and why before writing a line.
- **Read context files first** — verify against `architecture.md` and `project-overview.md`; never assume.
- **Scope is sacred** — build only what the current feature requires. Never go beyond scope.
- **Every feature must be testable** — if it cannot be verified immediately, it is incomplete.
- **Clean over clever** — simple readable code a junior can follow beats clever abstractions.
- **One thing at a time** — finish one feature fully before starting the next.
- **Ownership scoping is never optional** — every customer-facing query is scoped to the authenticated user. No exceptions.
- **Stock only moves through the choke point** — `inventoryService.commitOrderStock` / `releaseOrderStock`. Nothing else writes to `ProductVariant.stock`.
- **Failures are expected** — wrap risky operations, throw typed errors, never let one failure corrupt an order or stock count.

---

## TypeScript

- TypeScript strict mode (`strict: true` in `tsconfig.json`). No exceptions.
- Full type annotations on every exported function — parameters and return types.
- Never use `any`. Use precise types; narrow `unknown` inputs explicitly.
- Prefer `interface`/`type` over inline object shapes for anything reused.
- Use `Decimal` (from `@prisma/client/runtime`) or `decimal.js` for all money — never `number`.
- Prefer `readonly` and immutable patterns for DTOs passed between layers.
- Template literals for string formatting. No manual string concatenation for anything user-facing.
- ESLint + Prettier. Code must pass `eslint .` and `prettier --check .` clean.
- `tsc --noEmit` must pass with zero errors before a task is considered done.

---

## Express Conventions

- API versioned under `/api/v1`.
- Routes are **thin**: attach middleware → call controller. No business logic, no DB queries in route files.
- Controllers are **thin**: validate with the Zod schema → call the service → shape the HTTP response. No business logic, no DB queries in controllers.
- The project uses a **feature-based (vertical slice) structure**: each feature folder under `src/features/` holds its own `routes.ts`, `controller.ts`, `service.ts`, `repository.ts`, and `schema.ts`. See `architecture.md`.
- Customer routes and admin routes are never mixed in one router. Admin routes live under `/api/v1/admin/...` and always require `requireStaff`.
- Within a feature, business logic lives in `service.ts`, DB access in `repository.ts`. Controllers import the service; the service imports the repository.
- **Cross-feature calls go through services only.** A feature's service may import another feature's service (e.g. `orders` → `inventory.service.commitOrderStock`), but never another feature's repository directly.
- Genuinely shared code (middleware, errors, the Prisma client, shared Zod helpers) lives in `src/core/` and `src/db/`, never inside a feature.
- Always check the current Express, Prisma, and Zod docs before using an unfamiliar API — versions and APIs may differ from training data.

---

## Prisma

- One `PrismaClient` instance, exported from `db/prisma.ts`. Never instantiate a new client elsewhere.
- All queries go through a repository. Services never call `prisma.<model>` directly.
- Repositories that touch customer-owned tables require `userId` as a parameter and apply it as a `where` filter — never optional.
- Multi-step mutations that must be atomic use `prisma.$transaction(...)` (interactive transaction form when steps depend on prior results).
- Stock-affecting operations use `SELECT ... FOR UPDATE` (via `$queryRaw`) or Prisma's transaction isolation to stay race-safe on concurrent checkouts.
- Prisma schema field names are camelCase; the underlying column/table names are snake_case via `@map` / `@@map`, matching SQL conventions.

---

## Models (Prisma Schema)

```prisma
// prisma/schema.prisma (excerpt)
model ProductVariant {
  id          String   @id @default(uuid())
  productId   String   @map("product_id")
  size        String   @db.VarChar(20)
  color       String   @db.VarChar(50)
  sku         String   @unique @db.VarChar(100)
  priceOverride Decimal? @map("price_override") @db.Decimal(12, 2)
  stock       Int      @default(0)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  product     Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  orderItems  OrderItem[]

  @@index([productId])
  @@map("product_variants")
}
```

- One logical domain grouped per schema section; keep related models near each other in `schema.prisma`.
- Every FK declares an explicit `onDelete` matching the intended behavior (`Cascade`, `SetNull`, `Restrict`).
- Money: `Decimal @db.Decimal(12, 2)`. Stock/quantity: `Int`.
- Timestamps: `createdAt` (`@default(now())`) and `updatedAt` (`@updatedAt`) on every mutable table.
- Soft-deletable customer-facing entities (`Product`, `Category`) carry `deletedAt DateTime?`; genuinely disposable rows (`CartItem`, `RecentlyViewed`) are hard-deleted.

---

## Schemas (Zod)

- Separate schemas per operation: `createXSchema`, `updateXSchema`, and (where useful) `xResponseSchema`. Never reuse one schema for all three.
- Never accept `userId` or `staffId` from the request body — always taken from the authenticated session (`req.user.id` / `req.staff.id`).
- Never accept computed fields from the client (order totals, `stock`, `avgCost`-equivalents) — the service computes them.
- Money fields are validated as numeric strings and converted to `Decimal` in the service layer, not the schema.
- Quantities validated as positive integers.

```ts
// features/cart/schema.ts
import { z } from "zod";

export const addCartItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().positive().max(20),
});
```

---

## Repositories

```ts
// features/orders/repository.ts
import { prisma } from "../../db/prisma";

export const ordersRepository = {
  findByIdForUser(orderId: string, userId: string) {
    return prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { items: true, payment: true },
    });
  },
  // every customer-facing method takes userId and scopes on it — no exceptions
};
```

- Every read/update/delete on a customer-owned table is scoped by `userId`. No method bypasses it.
- Repositories return Prisma models or `null` — they never throw HTTP errors (that's the service/controller's job).
- No business logic in repositories — only data access.

---

## Services

```ts
// features/orders/service.ts
export async function createOrder(userId: string, input: CreateOrderInput): Promise<Order> {
  return prisma.$transaction(async (tx) => {
    // 1. validate cart items & lock variant stock
    // 2. commitOrderStock(tx, items) — the single choke point
    // 3. create Order + OrderItems
    // 4. create initial Payment row (PENDING)
    // 5. clear ordered items from the cart
  });
}
```

- All business rules live here. Services orchestrate repositories (and other features' services) and enforce invariants.
- Every stock change goes through `inventoryService.commitOrderStock` / `releaseOrderStock` — nothing else writes to `ProductVariant.stock`.
- Multi-table mutations are wrapped in one `prisma.$transaction`.
- Services throw typed errors from `core/errors/AppError.ts` (e.g. `InsufficientStockError`) — never construct raw HTTP responses.

---

## Route & Controller Handlers

```ts
// features/cart/routes.ts
import { Router } from "express";
import { requireCustomer } from "../../core/middleware/requireCustomer";
import { validate } from "../../core/middleware/validate";
import { addCartItemSchema } from "./schema";
import { addCartItem } from "./controller";

export const cartRouter = Router();

cartRouter.post("/items", requireCustomer, validate(addCartItemSchema), addCartItem);
```

```ts
// features/cart/controller.ts
import { Request, Response, NextFunction } from "express";
import * as cartService from "./service";

export async function addCartItem(req: Request, res: Response, next: NextFunction) {
  try {
    const cart = await cartService.addItem(req.user!.id, req.body);
    res.status(200).json({ success: true, data: cart });
  } catch (err) {
    next(err);
  }
}
```

- Controllers are thin. No try/except for business errors beyond forwarding to `next(err)` — the error-handling middleware converts typed exceptions to responses.
- Auth and identity come from middleware-attached `req.user` / `req.staff`, never parsed inline from headers or tokens.

---

## Response Envelope

- Success: `{ "success": true, "data": <payload> }`.
- Error: `{ "success": false, "error": { "code": "INSUFFICIENT_STOCK", "message": "..." } }`.
- Applied consistently by the shared error-handling middleware and a small response helper. Never return a raw object or array at the top level.

---

## Error Handling

- Typed errors in `core/errors/AppError.ts`, caught by a single Express error-handling middleware (registered last).
- Log every handled error with a context prefix: `logger.error("[orders.service.createOrder] ...")`.
- Never expose raw Prisma/driver errors to the client. User-facing messages are human-readable.
- Never use an empty `catch`. Catch specifically; rethrow typed errors.

---

## Naming

- Files: kebab-case module names within a feature — `routes.ts`, `controller.ts`, `service.ts`, `repository.ts`, `schema.ts`. The folder name carries the feature (`features/orders/service.ts`).
- Classes/Types: PascalCase — `OrderStatus`, `InsufficientStockError`.
- Functions/variables: camelCase — `commitOrderStock`, `userId`.
- Enums: PascalCase name, SCREAMING_SNAKE or PascalCase values matching the Prisma enum (`OrderStatus.CONFIRMED`).
- DB tables/columns: snake_case via `@map`/`@@map`, matching SQL conventions; Prisma model/field names stay camelCase/PascalCase.

---

## Imports

- Absolute-ish imports from `src/` where the project's path aliases allow (`@/features/inventory/service`); otherwise consistent relative imports.
- No relative imports climbing more than two levels (`../../..`) — if you need that, the code is in the wrong place.
- Group: Node builtins, third-party, local — separated by blank lines.

---

## Environment Variables

All config via `.env`, read through a single typed loader in `config/env.ts` (Zod-validated at boot). Never hardcode secrets, URLs, or keys.

| Variable | Used in |
|---|---|
| `DATABASE_URL` | `prisma/schema.prisma`, Prisma Client |
| `CLERK_SECRET_KEY` | `core/middleware/requireCustomer.ts`, `requireStaff.ts` |
| `REDIS_URL` | `config/redis.ts`, BullMQ queues |
| `CLOUDINARY_URL` | `config/cloudinary.ts` |
| `FCM_SERVER_KEY` | `config/fcm.ts` |
| `MOMO_API_KEY` / `MOMO_API_SECRET` | `features/payments/providers/momo.ts` |
| `AIRTEL_API_KEY` / `AIRTEL_API_SECRET` | `features/payments/providers/airtel.ts` |
| `SENTRY_DSN` | `app.ts` |
| `NODE_ENV` | `config/env.ts` |

---

## Constants

Magic values are named constants in one place — never inline.

```ts
// core/constants.ts
export const CART_ITEM_MAX_QUANTITY = 20;
export const UNPAID_ORDER_RELEASE_MINUTES = 30;
```

---

## Comments

- No comments restating what the code does — code is self-explanatory.
- Comments only for *why* — a non-obvious decision (e.g. why a row lock is needed on variant stock).
- Doc comments on services explaining the rule/invariant they enforce.
- Never leave `TODO` comments in committed code.

---

## Dependencies

Never add a package without a clear reason. Check first: does Node's stdlib, Express, or Prisma already cover it?

Approved dependencies:

- `express`, `@prisma/client`, `prisma`
- `zod`
- `@clerk/express` (or current Clerk Node SDK)
- `ioredis`, `bullmq`
- `cloudinary`
- `firebase-admin`
- `@sentry/node`
- `vitest` (or `jest`), `supertest`
- `eslint`, `prettier`, `typescript`
- `cors`, `morgan`, `dotenv` — CORS handling, dev request logging, and `.env` loading (spec 01 §3, §2)
- `tsx` — TS watch-mode runner for `npm run dev` (spec 01 §1)
- `tsc-alias` — rewrites `@/*` path aliases in compiled output; `tsc` alone does not do this (spec 01 §1)
- `typescript-eslint`, `@eslint/js`, `eslint-config-prettier` — flat ESLint config + TS support, and disabling stylistic rules that conflict with Prettier (spec 01 §1)
- `@types/node`, `@types/express`, `@types/cors`, `@types/morgan`, `@types/supertest` — type definitions for the above

Do not install anything else without updating this list first.
