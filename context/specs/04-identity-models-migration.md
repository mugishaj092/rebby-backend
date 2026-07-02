# Spec 04 — Identity Models + Migration

**Phase:** 1 — Foundation
**Depends on:** Spec 02 (Prisma Setup & Base Schema)
**Blocks:** Spec 05 (Auth Integration), and every feature spec touching `User`, `StaffProfile`, or `Address`

---

## Objective

Add the three identity models — `User`, `StaffProfile`, `Address` — to `prisma/schema.prisma`, matching `docs/schema.prisma` exactly, and generate/run the migration. No auth logic, no routes, no services yet — this spec is schema-only.

---

## Context

Read `docs/schema.prisma` — the `User`, `StaffProfile`, and `Address` model definitions there are the source of truth; copy them field-for-field. Read `references/access-levels.md` for why these two identity tables (customer vs staff) are separate.

---

## Requirements

### 1. `User` model

Add to `prisma/schema.prisma`, matching `docs/schema.prisma`:

```prisma
model User {
  id                    String    @id @default(uuid())
  clerkId               String    @unique @map("clerk_id")
  name                  String    @db.VarChar(191)
  email                 String    @unique @db.VarChar(191)
  phone                 String?   @db.VarChar(50)
  notificationsEnabled  Boolean   @default(true) @map("notifications_enabled")
  deviceToken           String?   @map("device_token") @db.VarChar(255)
  createdAt             DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt             DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt             DateTime? @map("deleted_at") @db.Timestamptz(6)

  addresses       Address[]

  @@map("users")
}
```

Note: this spec creates `User` without the relations to `Cart`, `Wishlist`, `Order`, `Notification`, `RecentlyViewed` shown in the full schema — those relation fields get added incrementally as each owning feature's spec creates its model (e.g. `Cart` is added to `User` in the Cart spec, not here). Adding a relation field to `User` that points at a model which doesn't exist yet will fail `prisma generate` — don't do it. Only `addresses` is included here because `Address` is created in this same spec.

### 2. `StaffProfile` model

```prisma
model StaffProfile {
  id        String    @id @default(uuid())
  clerkId   String    @unique @map("clerk_id")
  name      String    @db.VarChar(191)
  email     String    @unique @db.VarChar(191)
  role      StaffRole @default(staff)
  isActive  Boolean   @default(true) @map("is_active")
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@map("staff_profiles")
}
```

Same note applies: the `statusChanges`/`refundReviews` relations from the full schema are added later, by the specs that create `OrderStatusHistory` and `RefundRequest`.

### 3. `Address` model

```prisma
model Address {
  id           String   @id @default(uuid())
  userId       String   @map("user_id")
  label        String?  @db.VarChar(50)
  recipientName String  @map("recipient_name") @db.VarChar(191)
  phone        String   @db.VarChar(50)
  province     String   @db.VarChar(100)
  district     String   @db.VarChar(100)
  sector       String?  @db.VarChar(100)
  street       String?  @db.VarChar(255)
  isDefault    Boolean  @default(false) @map("is_default")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("addresses")
}
```

Note: `orders Order[]` on `Address` from the full schema is added later, by the Order spec.

### 4. Migration

- Run `prisma migrate dev --name add_identity_models`.
- Confirm the three tables exist with correct columns, types, the `user_id` FK with `ON DELETE CASCADE`, the `clerk_id`/`email` unique constraints on both `User` and `StaffProfile`, and the `user_id` index on `addresses`.

---

## Out of Scope

- Any relation field pointing at a model that doesn't exist yet (see notes above) — add those incrementally in the specs that create those models.
- Clerk integration / auth middleware (Spec 05).
- Repository or service code for these models (owned by Spec 05 for `User`/`StaffProfile`, and a later Addresses-in-checkout spec for `Address` CRUD).

---

## Acceptance Criteria

- [ ] `users`, `staff_profiles`, `addresses` tables exist in Postgres after migration.
- [ ] `users.clerk_id` and `users.email` are unique; same for `staff_profiles.clerk_id` and `staff_profiles.email`.
- [ ] `addresses.user_id` has a foreign key to `users.id` with `ON DELETE CASCADE`, and an index.
- [ ] `staff_profiles.role` is backed by the `staff_role` enum from Spec 02, defaulting to `staff`.
- [ ] `prisma generate` produces correctly typed `User`, `StaffProfile`, `Address` types with no errors.
- [ ] The app still boots and `GET /health` still works.

## Test Requirements

- A test that creates a `User` via `prisma.user.create(...)` directly (no service layer yet) and reads it back, confirming defaults (`notificationsEnabled: true`, `deletedAt: null`) are applied.
- A test that creating an `Address` with a non-existent `userId` fails with a foreign-key constraint error (proving the FK is enforced at the DB level, not just in application code).
- A test that deleting a `User` cascades to delete their `Address` rows.
