import { z } from 'zod';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugSchema(maxLength: number): z.ZodString {
  return z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(maxLength)
    .regex(SLUG_PATTERN, 'Invalid slug format');
}
