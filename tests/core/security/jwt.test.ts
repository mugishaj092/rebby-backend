import { createHash } from 'node:crypto';

import jsonwebtoken from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import { env } from '@/config/env';
import { UnauthorizedError } from '@/core/errors/AppError';
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from '@/core/security/jwt';
import { StaffRole } from '@/generated/prisma/enums';

describe('core/security/jwt', () => {
  describe('signAccessToken / verifyAccessToken', () => {
    it('round-trips a customer payload', () => {
      const token = signAccessToken({ sub: 'user-1', type: 'customer', email: 'jane@example.com' });

      const payload = verifyAccessToken(token);

      expect(payload).toEqual({ sub: 'user-1', type: 'customer', email: 'jane@example.com', role: undefined });
    });

    it('round-trips a staff payload including role', () => {
      const token = signAccessToken({
        sub: 'staff-1',
        type: 'staff',
        email: 'staff@example.com',
        role: StaffRole.manager,
      });

      const payload = verifyAccessToken(token);

      expect(payload).toEqual({
        sub: 'staff-1',
        type: 'staff',
        email: 'staff@example.com',
        role: StaffRole.manager,
      });
    });

    it('throws UnauthorizedError for a token signed with the wrong secret', () => {
      const token = jsonwebtoken.sign(
        { sub: 'user-1', type: 'customer', email: 'jane@example.com' },
        'a-totally-different-secret',
      );

      expect(() => verifyAccessToken(token)).toThrow(UnauthorizedError);
    });

    it('throws UnauthorizedError for an expired token', () => {
      const token = jsonwebtoken.sign(
        {
          sub: 'user-1',
          type: 'customer',
          email: 'jane@example.com',
          exp: Math.floor(Date.now() / 1000) - 10,
        },
        env.JWT_ACCESS_SECRET,
      );

      expect(() => verifyAccessToken(token)).toThrow(UnauthorizedError);
    });

    it('throws UnauthorizedError for a malformed token', () => {
      expect(() => verifyAccessToken('not-a-real-jwt')).toThrow(UnauthorizedError);
    });

    it('throws UnauthorizedError for a well-signed token with an invalid type claim', () => {
      const token = jsonwebtoken.sign(
        { sub: 'user-1', type: 'root', email: 'jane@example.com' },
        env.JWT_ACCESS_SECRET,
      );

      expect(() => verifyAccessToken(token)).toThrow(UnauthorizedError);
    });

    it('throws UnauthorizedError for a staff-typed token with a missing/invalid role', () => {
      const token = jsonwebtoken.sign(
        { sub: 'staff-1', type: 'staff', email: 'staff@example.com' },
        env.JWT_ACCESS_SECRET,
      );

      expect(() => verifyAccessToken(token)).toThrow(UnauthorizedError);
    });

    it('throws UnauthorizedError when the sub claim is missing', () => {
      const token = jsonwebtoken.sign({ type: 'customer', email: 'jane@example.com' }, env.JWT_ACCESS_SECRET);

      expect(() => verifyAccessToken(token)).toThrow(UnauthorizedError);
    });

    it('throws UnauthorizedError when the email claim is missing', () => {
      const token = jsonwebtoken.sign({ sub: 'user-1', type: 'customer' }, env.JWT_ACCESS_SECRET);

      expect(() => verifyAccessToken(token)).toThrow(UnauthorizedError);
    });
  });

  describe('generateRefreshToken / hashRefreshToken', () => {
    it('generates a high-entropy raw token whose hash matches sha256(raw)', () => {
      const { raw, hash } = generateRefreshToken();

      expect(raw).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).toBe(createHash('sha256').update(raw).digest('hex'));
      expect(hashRefreshToken(raw)).toBe(hash);
    });

    it('generates distinct tokens on each call', () => {
      const a = generateRefreshToken();
      const b = generateRefreshToken();

      expect(a.raw).not.toBe(b.raw);
      expect(a.hash).not.toBe(b.hash);
    });
  });
});
