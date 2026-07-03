import { z } from 'zod';

// Minimum 12 chars, no composition rules — NIST 800-63B favors length over
// forced complexity (uppercase/symbol requirements are not enforced here).
const passwordSchema = z.string().min(12).max(128);

// Normalized (trimmed + lowercased) before the email format check, since
// repository.ts does exact-match lookups (findUnique({ where: { email } })) —
// without this, "Jane@x.com" and "jane@x.com" would be treated as different
// accounts on register and could fail to match on login.
const emailSchema = z.string().trim().toLowerCase().email().max(191);

export const registerSchema = z.object({
  name: z.string().min(1).max(191),
  email: emailSchema,
  password: passwordSchema,
  phone: z.string().max(50).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
