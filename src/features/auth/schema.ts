import { z } from 'zod';

// Minimum 12 chars, no composition rules — NIST 800-63B favors length over
// forced complexity (uppercase/symbol requirements are not enforced here).
const passwordSchema = z.string().min(12).max(128);

export const registerSchema = z.object({
  name: z.string().min(1).max(191),
  email: z.string().email().max(191),
  password: passwordSchema,
  phone: z.string().max(50).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
