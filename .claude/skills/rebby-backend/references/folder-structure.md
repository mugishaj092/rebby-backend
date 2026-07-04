# Folder Structure & Layering

## Feature-based (vertical slice) layout

```
src/
  server.ts / app.ts
  config/            # env.ts, redis.ts, cloudinary.ts, fcm.ts
  core/              # middleware, errors, utils, validation — shared by 2+ features
  db/prisma.ts       # single PrismaClient instance
  features/
    auth/
    categories/
    products/        # Product + ProductImage (variants live in their own feature)
    variants/        # ProductVariant — routes nested under a product id, owned here
    collections/
    banners/
    home/            # service-only composition of collections + banners for GET /home
    discovery/
    cart/
    wishlist/
    orders/
    inventory/       # service-only, no routes — commitOrderStock / releaseOrderStock
    payments/
    notifications/
    admin/
    support/
  jobs/              # BullMQ processors
prisma/schema.prisma
tests/features/...
```

Each feature folder contains exactly: `routes.ts`, `controller.ts`, `service.ts`, `repository.ts`, `schema.ts`.

## Internal layering (applies inside every feature)

```
routes.ts  →  controller.ts  →  service.ts  →  repository.ts  →  Prisma / db
                                      ↓
                                 schema.ts (Zod validation)
```

- **routes.ts** — Express routes + middleware wiring only. No logic.
- **controller.ts** — parse/validate request → call service → shape response. No business logic, no DB queries.
- **service.ts** — all business logic, transactions, rule enforcement. Orchestrates its own repository and other features' *services*.
- **repository.ts** — all DB access via Prisma. Ownership-scoped by construction for customer tables. Never called directly by a controller.
- **schema.ts** — Zod `create`/`update`/`read` schemas.

## Cross-feature rules

- Cross-feature calls go through `service.ts` only. `orders/service.ts` may call `inventory.service.commitOrderStock`, but must never import `inventory/repository.ts` directly.
- `core/` and `db/` are not features — they hold code used by 2+ features (middleware, error types, the Prisma client). Single-feature code stays in that feature.
- `inventory/` has no routes — it's an internal service-only feature, called by `orders` (and later `admin`).
- Dependency direction: `orders`/`payments` → `inventory` → `variants`/`collections`/`banners`/`home` → `products`/`categories` → `core`. No circular imports.
  - Granular graph: `products → categories`, `variants → products`, `collections → products`, `banners → products, categories, collections`, `home → collections, banners`.
  - Two narrow exceptions avoid an otherwise-circular dependency: `categories/repository.ts` and `products/repository.ts` each query one foreign table directly (`products`, `product_variants`) via the shared Prisma client rather than calling the other feature's service — see `architecture.md`'s "No circular dependencies" note for why.
