import { z } from 'zod';
import { uuidSchema } from '../common/identifiers.schema.js';

export const accountEmailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((email) => email.toLowerCase());

export const accountDisplayNameSchema = z.string().trim().min(1).max(100);

export const publicAccountSchema = z
  .object({
    id: uuidSchema,
    displayName: accountDisplayNameSchema,
    email: accountEmailSchema,
  })
  .strict();

export type PublicAccount = z.infer<typeof publicAccountSchema>;
