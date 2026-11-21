import { z } from 'zod';
import { createSuccessResponseSchema } from '../common/api-response.schema.js';
import {
  accountActionAcceptedResponseSchema,
  accountActionTokenSchema,
} from './account-action.schema.js';
import { accountEmailSchema } from './public-account.schema.js';
import { newPasswordSchema } from './password.schema.js';

const passwordResetCompleteDataSchema = z
  .object({
    passwordReset: z.literal(true),
  })
  .strict();

export const requestPasswordResetRequestSchema = z
  .object({
    email: accountEmailSchema,
  })
  .strict();

export const requestPasswordResetResponseSchema = accountActionAcceptedResponseSchema;

export const completePasswordResetRequestSchema = z
  .object({
    token: accountActionTokenSchema,
    newPassword: newPasswordSchema,
  })
  .strict();

export const completePasswordResetResponseSchema = createSuccessResponseSchema(
  passwordResetCompleteDataSchema,
);

export type RequestPasswordResetRequest = z.infer<typeof requestPasswordResetRequestSchema>;
export type RequestPasswordResetResponse = z.infer<typeof requestPasswordResetResponseSchema>;
export type CompletePasswordResetRequest = z.infer<typeof completePasswordResetRequestSchema>;
export type CompletePasswordResetResponse = z.infer<typeof completePasswordResetResponseSchema>;
