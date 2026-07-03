# Spec 05 — Auth (Self-Hosted JWT)

**Phase:** 1 — Foundation
**Depends on:** Spec 03 (Core Middleware & Error Handling), Spec 04 (Identity Models + Migration) — **with the schema amendments below, which supersede Spec 04's Clerk-based fields**
**Blocks:** every customer-facing and admin-facing feature spec (all of them use `requireCustomer` / `requireStaff`)

**Supersedes:** the Clerk-based version of this spec. REBY now runs its own credential store — no third-party identity provider. This is a deliberate security/ownership tradeoff: full control over the auth flow, but REBY now owns password storage, token issuance, and revocation correctly, which is a meaningfully bigger responsibility than delegating to Clerk. The requirements below exist to make that responsibility properly discharged, not shortcut.

---

## Objective

Build a self-hosted, credential-based auth system for both access levels (customer and staff), using:
- **argon2id** for password hashing (OWASP's current recommended default).
- **Short-lived signed JWT access tokens** (Bearer, `Authorization` header) — stateless, 15-minute expiry.
- **Long-lived opaque refresh tokens**, delivered in an `httpOnly`, `Secure`, `SameSite=Strict` cookie, stored **hashed** server-side so they're individually revocable, and **rotated on every use with reuse detection** (a replayed, already-rotated refresh token revokes the entire token family — see Requirement 5).

This spec also creates `features/auth/` and the two auth middlewares, `requireCustomer` and `requireStaff(minRole)`, that every later route depends on.

---

## Context

Read `references/access-levels.md` for the customer-vs-staff contract (still accurate — only the *mechanism* changes, not the two-access-level model). Read `references/golden-rules.md` — nothing there changes either.

**A note on mobile vs web clients:** the admin dashboard is a browser app, where `httpOnly` cookies work natively. The customer mobile app (React Native/Expo) does **not** automatically persist cookies the way a browser does — the mobile client is responsible for using a cookie-aware HTTP client (or extracting the `Set-Cookie` value and re-attaching it manually) to participate in this flow. That's a mobile-app implementation concern, not something this backend spec needs to solve, but it's worth knowing before assuming the cookie flow "just works" on the app.

---

## Requirements

### 1. Schema amendments (replace Spec 04's Clerk fields)

Update `User` and `StaffProfile` (from Spec 04) — remove `clerkId`, add password + account-security fields:

```prisma
model User {
  id                    String    @id @default(uuid())
  email                 String    @unique @db.VarChar(191)
  passwordHash          String    @map("password_hash") @db.VarChar(255)
  name                  String    @db.VarChar(191)
  phone                 String?   @db.VarChar(50)
  notificationsEnabled  Boolean   @default(true) @map("notifications_enabled")
  deviceToken           String?   @map("device_token") @db.VarChar(255)
  failedLoginAttempts   Int       @default(0) @map("failed_login_attempts")
  lockedUntil           DateTime? @map("locked_until") @db.Timestamptz(6)
  createdAt             DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt             DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt             DateTime? @map("deleted_at") @db.Timestamptz(6)

  addresses     Address[]
  refreshTokens RefreshToken[]

  @@map("users")
}

model StaffProfile {
  id                  String    @id @default(uuid())
  email               String    @unique @db.VarChar(191)
  passwordHash        String    @map("password_hash") @db.VarChar(255)
  name                String    @db.VarChar(191)
  role                StaffRole @default(staff)
  isActive            Boolean   @default(true) @map("is_active")
  failedLoginAttempts Int       @default(0) @map("failed_login_attempts")
  lockedUntil         DateTime? @map("locked_until") @db.Timestamptz(6)
  createdAt           DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  refreshTokens RefreshToken[]

  @@map("staff_profiles")
}
```

Add a new model for revocable refresh tokens:

```prisma
model RefreshToken {
  id                  String    @id @default(uuid())
  tokenHash           String    @unique @map("token_hash") @db.VarChar(64) // SHA-256 hex digest; the raw token is NEVER stored
  tokenType           String    @map("token_type") @db.VarChar(20) // "customer" | "staff" — must match the JWT `type` claim it was issued alongside
  userId              String?   @map("user_id")
  staffId             String?   @map("staff_id")
  expiresAt           DateTime  @map("expires_at") @db.Timestamptz(6)
  revokedAt           DateTime? @map("revoked_at") @db.Timestamptz(6)
  replacedByTokenHash String?   @map("replaced_by_token_hash") @db.VarChar(64)
  ipAddress           String?   @map("ip_address") @db.VarChar(45)
  userAgent           String?   @map("user_agent") @db.VarChar(255)
  createdAt           DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  user  User?         @relation(fields: [userId], references: [id], onDelete: Cascade)
  staff StaffProfile? @relation(fields: [staffId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([staffId])
  @@index([expiresAt])
  @@map("refresh_tokens")
}
```

Exactly one of `userId`/`staffId` must be set per row — enforce in application code at write time (Prisma doesn't support DB-level XOR constraints cleanly; add a `CHECK` constraint via a raw SQL migration step if you want DB-level enforcement too — recommended, not required).

Run `prisma migrate dev --name replace_clerk_with_jwt_auth`.

### 2. Password hashing — `core/security/password.ts`

- Use `argon2` (the `argon2` npm package, argon2id variant) — not `bcrypt`. Parameters: follow the package's current recommended defaults (memory cost, time cost, parallelism) rather than hardcoding outdated values; note the chosen parameters in a comment so they can be revisited as hardware improves.
- `hashPassword(plain: string): Promise<string>`
- `verifyPassword(hash: string, plain: string): Promise<boolean>`
- Password policy (enforced in the Zod schema, Requirement 6): minimum 12 characters. Do not enforce arbitrary composition rules (uppercase/symbol requirements) — current guidance (NIST 800-63B) favors length over composition complexity.

### 3. Token issuance — `core/security/jwt.ts`

**Access token (JWT, signed, short-lived):**
- Algorithm: HS256. Secrets: `JWT_ACCESS_SECRET`, a distinct, high-entropy value from the refresh-token hashing secret — never reuse secrets across purposes.
- Claims: `sub` (user or staff id), `type` (`"customer"` | `"staff"`), `role` (staff only), `iat`, `exp`.
- TTL: 15 minutes (`ACCESS_TOKEN_TTL_MINUTES` env-configurable, default 15).
- `signAccessToken(payload)`, `verifyAccessToken(token)` (throws on invalid signature, expiry, or malformed token).
- **Tradeoff to document explicitly in code comments:** access tokens are verified statelessly (signature + expiry only, no DB hit per request) for performance. This means an account deactivation, role change, or account lock takes up to 15 minutes to propagate to already-issued access tokens. This is an accepted tradeoff given the short TTL — if a project ever needs *immediate* revocation, that requires either a DB check per request (defeats the performance purpose) or a short-lived denylist; out of scope for this spec.

**Refresh token (opaque, long-lived, revocable):**
- `generateRefreshToken(): { raw: string; hash: string }` — `raw` is `crypto.randomBytes(32).toString('hex')` (256 bits of entropy); `hash` is `sha256(raw)` hex digest, which is what gets stored in `RefreshToken.tokenHash`. The raw value is returned to the client and never persisted.
- TTL: 30 days (`REFRESH_TOKEN_TTL_DAYS` env-configurable, default 30).

### 4. Cookie configuration

- Cookie name: `reby_refresh_token` (customer) / `reby_staff_refresh_token` (staff) — separate cookies with separate, path-scoped visibility so a customer refresh cookie is never sent to `/api/v1/admin/auth/refresh` and vice versa.
- Attributes: `httpOnly: true`, `secure: true` in production (`false` allowed only in local dev over `http://localhost`), `sameSite: 'strict'`, `path` scoped to the relevant refresh endpoint only (e.g. `/api/v1/auth/refresh`), `maxAge` matching `REFRESH_TOKEN_TTL_DAYS`.

### 5. Refresh flow with rotation & reuse detection

On `POST .../auth/refresh`:
1. Read the raw refresh token from the cookie. Missing cookie → `UnauthorizedError`.
2. Hash it, look up `RefreshToken` by `tokenHash`.
3. **Not found** → `UnauthorizedError` (token is bogus or already long-expired and pruned).
4. **Found but `revokedAt` is set** → this is a reuse of an already-rotated (or already-logged-out) token, which indicates possible theft. Revoke every other non-revoked `RefreshToken` row for that same `userId`/`staffId` (the whole token family), and respond `UnauthorizedError`. This forces full re-login and is the actual security payoff of rotation — implement it exactly, don't skip it as an edge case.
5. **Found, valid, not expired** → issue a new access token, generate a *new* refresh token, mark the old row `revokedAt = now()` and `replacedByTokenHash = <new token's hash>`, insert the new `RefreshToken` row, set the new cookie, return the new access token in the response body.
6. **Found but `expiresAt` has passed** → `UnauthorizedError`; do not silently renew past the absolute TTL.

### 6. Routes & schemas — `features/auth/`

Customer (`/api/v1/auth/...`):
```
POST /api/v1/auth/register   — email, password (min 12 chars), name, phone? → creates User, issues tokens
POST /api/v1/auth/login      — email, password → issues tokens
POST /api/v1/auth/refresh    — reads refresh cookie → rotates, issues new access token
POST /api/v1/auth/logout     — revokes the presented refresh token, clears cookie
```

Staff (`/api/v1/admin/auth/...`):
```
POST /api/v1/admin/auth/login    — email, password → issues tokens
POST /api/v1/admin/auth/refresh  — same rotation logic, staff cookie
POST /api/v1/admin/auth/logout   — revokes, clears cookie
```

There is deliberately **no public staff registration endpoint** — staff accounts are created by an `OWNER` through staff-management endpoints (a later admin spec) or seeded directly for the first owner account (Spec 35 / a one-time bootstrap script). Note this explicitly so the agent doesn't add one.

- `registerSchema`: `email` (valid email), `password` (min 12 chars — see Requirement 2), `name`, `phone?`.
- `loginSchema`: `email`, `password`.
- Login/register responses: `{ success: true, data: { accessToken: string, expiresIn: number, user: { id, email, name } } }` (or `staff` in place of `user` for the staff flow). The refresh token is **never** present in the JSON body — cookie only.

### 7. Login hardening

- **Rate limiting:** apply `core/middleware/rateLimit.ts` (scaffolded in Spec 03) to `login` and `register` — e.g. 10 requests/minute per IP, plus a stricter per-email-address limit on `login` (e.g. 5 failed attempts per 15 minutes) to blunt credential stuffing without only relying on IP-based limits (which are weak against distributed attempts).
- **Account lockout:** on each failed login, increment `failedLoginAttempts`; after 5 consecutive failures, set `lockedUntil = now() + 15 minutes` and reject further attempts (even correct-password ones) until it passes, with a generic message. Reset `failedLoginAttempts` to 0 on a successful login.
- **User enumeration resistance:** login failure responses are identical (`UnauthorizedError`, "Invalid email or password") whether the email doesn't exist, the password is wrong, or the account is locked — do not give an attacker a way to distinguish these cases via response content or timing (use a constant-time password comparison, which `argon2.verify` already provides — don't short-circuit before calling it even when the email lookup fails; hash a dummy value in that branch to keep timing consistent).
- **Security headers:** add `helmet` to `app.ts` (if not already present from Spec 01/03) — this is a two-line addition directly relevant to hardening the auth surface and belongs in this spec rather than being deferred indefinitely.

### 8. `requireCustomer` / `requireStaff(minRole)` middleware

Same external contract as before, new internal mechanism:
- Read `Authorization: Bearer <token>` header. Missing/malformed → `UnauthorizedError`.
- `verifyAccessToken(token)` — invalid signature or expired → `UnauthorizedError`.
- Check `type` claim: `requireCustomer` requires `type: "customer"`; `requireStaff` requires `type: "staff"`. Wrong type → `ForbiddenError`.
- `requireStaff(minRole)` additionally checks the `role` claim against the `STAFF < MANAGER < OWNER` hierarchy (same helper/constant as before) → `ForbiddenError` if insufficient.
- Attach `req.user = { id, email }` or `req.staff = { id, email, role }` directly from the verified JWT payload — no DB hit on the hot path (see the stateless tradeoff noted in Requirement 3).

### 9. Type augmentation

Same as before: `src/types/express.d.ts` augmenting `Express.Request` with `user?` / `staff?`.

### 10. Debug routes

Same as before — throwaway `GET /api/v1/_debug/whoami` and `GET /api/v1/_debug/staff-whoami`, guarded by `NODE_ENV !== 'production'` or removed once a real protected route exists.

---

## Out of Scope

- Email verification flow (send-verification-email, confirm) — flagged as a future spec; `User` has no `emailVerifiedAt` field yet.
- "Forgot password" / reset flow — future spec.
- OAuth/social login (Google/Apple Sign-In from the original product spec) — future spec; this spec is email+password only.
- Staff account creation/management endpoints — later admin spec; this spec assumes at least one `StaffProfile` exists via direct seed/DB insert for testing.
- Any real feature route beyond the two debug routes.
- A denylist/immediate-revocation mechanism for access tokens (see the documented tradeoff in Requirement 3).

---

## Acceptance Criteria

- [ ] `POST /api/v1/auth/register` creates a `User` with an `argon2id` password hash (never a plaintext or reversibly-encrypted password anywhere, including logs).
- [ ] `POST /api/v1/auth/login` with correct credentials returns an access token and sets the refresh cookie with `httpOnly`, `secure` (prod), `sameSite=strict`.
- [ ] `POST /api/v1/auth/refresh` with a valid refresh cookie rotates the token: the old `RefreshToken` row is marked revoked with `replacedByTokenHash` set, a new row is inserted, a new access token is returned.
- [ ] Replaying an **already-rotated** refresh token triggers full family revocation — a subsequent refresh attempt with the *next* token in that same original chain also fails.
- [ ] 5 consecutive failed logins for the same email lock the account for 15 minutes, including rejecting subsequent *correct*-password attempts during the lock window.
- [ ] Login failure responses are content-identical for "email doesn't exist," "wrong password," and "account locked."
- [ ] `GET /api/v1/_debug/whoami` works with a valid customer Bearer token and 403s with a valid staff token.
- [ ] `GET /api/v1/_debug/staff-whoami` correctly enforces the `STAFF < MANAGER < OWNER` hierarchy.
- [ ] `POST /api/v1/auth/logout` revokes the presented refresh token (a subsequent refresh attempt with it fails) and clears the cookie.
- [ ] `npm run typecheck` passes — `req.user`/`req.staff` typed without casting.

## Test Requirements

- Registration + login happy path, asserting the stored `passwordHash` is not the plaintext password and verifies correctly via `argon2.verify`.
- Refresh rotation test: refresh once, confirm the old token is now rejected and the new one works.
- **Reuse-detection test** (the most important test in this spec): capture refresh token A, use it to get token B (A now revoked), then attempt to use A again — assert both the replay attempt *and* a subsequent legitimate attempt with B are both rejected (family revocation).
- Account lockout test: 5 failed logins lock the account; a 6th attempt with the *correct* password during the lock window still fails; after the lock window (or by mocking time), a correct-password login succeeds and resets `failedLoginAttempts`.
- Timing-consistency spot check (best-effort, not a strict timing assertion in CI): confirm the login path calls `argon2.verify` (or an equivalent dummy hash) even when the email doesn't exist, rather than returning immediately.
- `requireCustomer`/`requireStaff` middleware tests: expired token, malformed token, wrong `type` claim, insufficient `role` — each rejected with the correct error.
- Cookie-scoping test: a customer refresh cookie is not accepted by `/api/v1/admin/auth/refresh` and vice versa.
