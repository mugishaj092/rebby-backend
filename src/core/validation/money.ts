import { z } from 'zod';

export const moneySchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a positive decimal string with up to 2 decimal places')
  .refine((value) => Number(value) > 0, 'Must be greater than 0');
