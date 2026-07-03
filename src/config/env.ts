import 'dotenv/config';

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Access-token signing secret — deliberately distinct from any refresh-token secret
  // (refresh tokens are opaque + SHA-256 hashed, not signed, so no secret is needed there).
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET is required and must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  CLOUDINARY_URL: z.string().min(1, 'CLOUDINARY_URL is required'),
  FCM_SERVER_KEY: z.string().min(1, 'FCM_SERVER_KEY is required'),
  SENTRY_DSN: z.string().min(1, 'SENTRY_DSN is required'),
  CORS_ORIGIN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {}

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new EnvValidationError(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}

export function loadEnv(parse: (source: NodeJS.ProcessEnv) => Env = parseEnv): Env {
  try {
    return parse(process.env);
  } catch (err) {
    if (err instanceof EnvValidationError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

export const env = loadEnv();
