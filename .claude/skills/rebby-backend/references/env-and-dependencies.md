# Environment Variables & Dependencies

## Environment variables

All config is loaded through `config/env.ts`, Zod-validated at boot. Never hardcode secrets, URLs, or keys.

| Variable | Used in |
|---|---|
| `DATABASE_URL` | `prisma/schema.prisma`, Prisma Client |
| `JWT_ACCESS_SECRET` | `core/security/jwt.ts` (sign/verify access tokens), used by `core/middleware/requireCustomer.ts`/`requireStaff.ts` |
| `ACCESS_TOKEN_TTL_MINUTES` | `core/security/jwt.ts` |
| `REFRESH_TOKEN_TTL_DAYS` | `features/auth/service.ts`, `features/auth/cookies.ts` |
| `REDIS_URL` | `config/redis.ts`, BullMQ queues |
| `CLOUDINARY_URL` | `config/cloudinary.ts` |
| `FCM_SERVER_KEY` | `config/fcm.ts` |
| `MOMO_API_KEY` / `MOMO_API_SECRET` | `features/payments/providers/momo.ts` |
| `AIRTEL_API_KEY` / `AIRTEL_API_SECRET` | `features/payments/providers/airtel.ts` |
| `SENTRY_DSN` | `app.ts` |
| `NODE_ENV` | `config/env.ts` |

## Approved dependencies

- `express`, `@prisma/client`, `prisma`
- `zod`
- `argon2`, `jsonwebtoken` — argon2id password hashing and access-token JWTs (customer + staff auth)
- `express-rate-limit`, `helmet`, `cookie-parser` — auth hardening (IP rate limiting, security headers, refresh-token cookie parsing)
- `ioredis`, `bullmq`
- `cloudinary`
- `firebase-admin`
- `@sentry/node`
- `vitest` (or `jest`), `supertest`
- `eslint`, `prettier`, `typescript`

Do not add anything else without updating this list in `docs/code-standards.md` first — check whether Node's stdlib, Express, or Prisma already covers the need before reaching for a new package.
