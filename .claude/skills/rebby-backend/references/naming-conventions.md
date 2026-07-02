# Naming Conventions

| What | Convention | Example |
|---|---|---|
| Files within a feature | fixed lowercase names | `routes.ts`, `controller.ts`, `service.ts`, `repository.ts`, `schema.ts` |
| Classes / Types / Errors | PascalCase | `InsufficientStockError`, `OrderStatus` |
| Functions / variables | camelCase | `commitOrderStock`, `userId` |
| Enum values | match the Prisma enum casing | `OrderStatus.CONFIRMED` |
| DB tables/columns | snake_case via `@map` / `@@map` | `product_variants`, `user_id` |
| Prisma model/field names | camelCase / PascalCase | `ProductVariant.priceOverride` |
| Zod schemas | verb-first, operation-suffixed | `createOrderSchema`, `updateProductSchema` |

## Imports

- Group: Node builtins → third-party → local, separated by blank lines.
- No relative imports climbing more than two levels (`../../..`) — if you need that, the file is in the wrong place.
- Prefer path aliases where configured (e.g. `@/features/inventory/service`) over long relative chains.

## Constants

Magic values are named constants in `core/constants.ts`, never inlined:

```ts
export const CART_ITEM_MAX_QUANTITY = 20;
export const UNPAID_ORDER_RELEASE_MINUTES = 30;
```
