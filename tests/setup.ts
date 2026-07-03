import 'dotenv/config';

process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT ?? '4000';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://user:password@localhost:5432/reby_test';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'test_jwt_access_secret_at_least_32_characters_long';
process.env.ACCESS_TOKEN_TTL_MINUTES = process.env.ACCESS_TOKEN_TTL_MINUTES ?? '15';
process.env.REFRESH_TOKEN_TTL_DAYS = process.env.REFRESH_TOKEN_TTL_DAYS ?? '30';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.CLOUDINARY_URL =
  process.env.CLOUDINARY_URL ?? 'cloudinary://api_key:api_secret@cloud_name';
process.env.FCM_SERVER_KEY = process.env.FCM_SERVER_KEY ?? 'test_fcm_server_key';
process.env.SENTRY_DSN = process.env.SENTRY_DSN ?? 'https://public@sentry.example.com/1';
