# Access Levels & Auth

| | Customer | Staff / Admin |
|---|---|---|
| Identity table | `users` | `staff_profiles` |
| Clerk session | Yes | Yes |
| Distinguishing claim | `publicMetadata.role` absent or `"customer"` | `publicMetadata.role` = `"staff"` \| `"manager"` \| `"owner"` |
| Middleware | `requireCustomer` | `requireStaff(minRole)` |
| Scope | own data only, ownership-scoped | cross-customer, audited |

- `StaffRole` order: `STAFF < MANAGER < OWNER`. `requireStaff(minRole)` rejects a session whose role is below the route's required minimum.
- A staff Clerk account and a customer Clerk account are always different Clerk users — one identity never holds both roles.
- `requireCustomer` verifies the Clerk session, loads/creates the corresponding `User` row, attaches `req.user`.
- `requireStaff(minRole)` verifies the Clerk session, requires a matching `StaffProfile` row with sufficient role, attaches `req.staff`.
- Every route uses exactly one of these two, or is explicitly marked public (only genuinely public catalog-browsing routes: product/category/collection/banner reads).
- Admin mutations record `updatedBy: staffId` and, for orders, append an `OrderStatusHistory` row — cross-customer access is always traceable to a specific staff member.
