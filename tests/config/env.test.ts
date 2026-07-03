import { describe, expect, it } from 'vitest';

import { EnvValidationError, parseEnv } from '@/config/env';

const validEnv = {
  NODE_ENV: 'test',
  PORT: '4000',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/reby_test',
  JWT_ACCESS_SECRET: 'test_jwt_access_secret_at_least_32_characters_long',
  REDIS_URL: 'redis://localhost:6379',
  CLOUDINARY_URL: 'cloudinary://api_key:api_secret@cloud_name',
  FCM_SERVER_KEY: 'test_fcm_server_key',
  SENTRY_DSN: 'https://public@sentry.example.com/1',
};

describe('parseEnv', () => {
  it('parses a valid env object', () => {
    const env = parseEnv(validEnv);

    expect(env.NODE_ENV).toBe('test');
    expect(env.PORT).toBe(4000);
    expect(env.DATABASE_URL).toBe(validEnv.DATABASE_URL);
  });

  it('throws a readable EnvValidationError when a required var is missing', () => {
    const { DATABASE_URL, ...incompleteEnv } = validEnv;
    void DATABASE_URL;

    expect(() => parseEnv(incompleteEnv)).toThrow(EnvValidationError);
    expect(() => parseEnv(incompleteEnv)).toThrow(/DATABASE_URL/);
  });
});
