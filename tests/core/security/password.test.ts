import { describe, expect, it } from 'vitest';

import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from '@/core/security/password';

describe('core/security/password', () => {
  it('hashPassword produces an argon2id hash distinct from the plaintext', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');

    expect(hash).not.toBe('correct-horse-battery-staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verifyPassword resolves true for the correct password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');

    await expect(verifyPassword(hash, 'correct-horse-battery-staple')).resolves.toBe(true);
  });

  it('verifyPassword resolves false for the wrong password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');

    await expect(verifyPassword(hash, 'wrong-password')).resolves.toBe(false);
  });

  it('the dummy hash is a valid argon2id hash usable for timing-consistent verify calls', async () => {
    expect(DUMMY_PASSWORD_HASH.startsWith('$argon2id$')).toBe(true);
    await expect(verifyPassword(DUMMY_PASSWORD_HASH, 'anything')).resolves.toBe(false);
  });
});
