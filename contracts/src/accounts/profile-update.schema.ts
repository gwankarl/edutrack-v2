import { z } from 'zod';
import { accountDisplayNameSchema } from './public-account.schema.js';

export const updateProfileRequestSchema = z
  .object({
    displayName: accountDisplayNameSchema,
  })
  .strict();

export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
