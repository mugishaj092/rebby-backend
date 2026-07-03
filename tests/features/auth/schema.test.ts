import { describe, expect, it } from 'vitest';

import { loginSchema, registerSchema } from '@/features/auth/schema';

describe('features/auth/schema', () => {
  describe('registerSchema', () => {
    it('trims and lowercases the email', () => {
      const result = registerSchema.parse({
        name: 'Jane Doe',
        email: '  Jane.DOE@Example.COM  ',
        password: 'correct-horse-battery-staple',
      });

      expect(result.email).toBe('jane.doe@example.com');
    });

    it('rejects an invalid email even after normalization', () => {
      expect(() =>
        registerSchema.parse({ name: 'Jane Doe', email: '  not-an-email  ', password: 'correct-horse-battery-staple' }),
      ).toThrow();
    });
  });

  describe('loginSchema', () => {
    it('trims and lowercases the email', () => {
      const result = loginSchema.parse({ email: '  Jane.DOE@Example.COM  ', password: 'whatever' });

      expect(result.email).toBe('jane.doe@example.com');
    });

    it('enforces the same max length as registerSchema', () => {
      const overlong = `${'a'.repeat(185)}@example.com`; // > 191 chars total

      expect(() => loginSchema.parse({ email: overlong, password: 'whatever' })).toThrow();
    });
  });
});
