import * as argon2 from 'argon2';

// Uses the `argon2` package's built-in defaults (argon2id, memoryCost 65536 KiB / 64 MiB,
// timeCost 3, parallelism 4) rather than hardcoding our own — these track the package's
// current OWASP-aligned recommendation, so bumping the dependency is how these get revisited
// as hardware improves, instead of a stale constant living in this repo.
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain);
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}

// A precomputed, valid argon2id hash of an arbitrary value with no corresponding account.
// Used to pay the same argon2.verify() cost on a login attempt for an email that doesn't
// exist, so "unknown email" isn't distinguishable from "wrong password" by response timing.
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$D4PjFW6hKMBaiLvwWUtafw$D6hr1Yfv1c3r/f0zVxQiTX4nyTdU3R6/OUy/avphZ6o';
