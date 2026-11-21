import { z } from 'zod';
import { createSuccessResponseSchema } from '../common/api-response.schema.js';
import { currentPasswordSchema, newPasswordSchema } from './password.schema.js';

const passwordChangedDataSchema = z
  .object({
    passwordChanged: z.literal(true),
  })
  .strict();

export const changePasswordRequestSchema = z
  .object({
    currentPassword: currentPasswordSchema,
    newPassword: newPasswordSchema,
  })
  .strict();

export const changePasswordResponseSchema = createSuccessResponseSchema(passwordChangedDataSchema);

export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type ChangePasswordResponse = z.infer<typeof changePasswordResponseSchema>;
