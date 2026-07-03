# Access Levels & Auth

| | Customer | Staff / Admin |
|---|---|---|
| Identity table | `users` | `staff_profiles` |
| Password hashing | argon2id | argon2id |
| Access token | Signed JWT, 15 min TTL, `Authorization: Bearer` | Signed JWT, 15 min TTL, `Authorization: Bearer` |
| Refresh token | Opaque, 30-day TTL, `reby_refresh_token` httpOnly cookie (path `/api/v1/auth`) | Opaque, 30-day TTL, `reby_staff_refresh_token` httpOnly cookie (path `/api/v1/admin/auth`) |
| Distinguishing claim | JWT `type: "customer"` | JWT `type: "staff"` (+ `role`) |
| Middleware | `requireCustomer` | `requireStaff(minRole)` |
| Scope | own data only, ownership-scoped | cross-customer, audited |

- `StaffRole` order: `STAFF < MANAGER < OWNER`. `requireStaff(minRole)` rejects a session whose role is below the route's required minimum.
- Customer and staff accounts are always separate rows in separate tables — one identity never holds both roles.
- Customers self-register via `POST /api/v1/auth/register` and log in via `POST /api/v1/auth/login`. Staff accounts are provisioned separately (not self-registered — direct DB/seed for now) and log in via `POST /api/v1/admin/auth/login`.
- `requireCustomer` / `requireStaff(minRole)` verify the access-token JWT **statelessly** (`Authorization: Bearer <token>`, signature + expiry only via `JWT_ACCESS_SECRET`, no DB hit) and attach `req.user`/`req.staff` directly from the token's claims. Tradeoff: a deactivation/role change/lock takes up to `ACCESS_TOKEN_TTL_MINUTES` to reach an already-issued token.
- `POST .../refresh` (customer: `/api/v1/auth/refresh`, staff: `/api/v1/admin/auth/refresh`) reads the refresh cookie, rotates it (old row revoked + `replacedByTokenHash` set, new row issued), and *does* hit the DB — re-checking `isActive`/`deletedAt` there, and re-verifying `role`.
- **Reuse detection**: replaying an already-rotated (or already-logged-out) refresh token revokes every other active `RefreshToken` row for that account, forcing a full re-login everywhere. This is the core security property of the rotation scheme — never skip it.
- **Account lockout**: 5 consecutive failed logins locks the account for 15 minutes (`failedLoginAttempts`/`lockedUntil`), rejecting even a correct password until the lock passes.
- **Timing/enumeration resistance**: login always calls `verifyPassword` (real hash or a precomputed dummy hash for a nonexistent/soft-deleted/inactive account) so "unknown email," "wrong password," and "locked account" are content- and timing-indistinguishable.
- Every route uses exactly one of these two, or is explicitly marked public (only genuinely public catalog-browsing routes: product/category/collection/banner reads).
- Admin mutations record `updatedBy: staffId` and, for orders, append an `OrderStatusHistory` row — cross-customer access is always traceable to a specific staff member.
