import { z } from 'zod';
import { createSuccessResponseSchema } from '../common/api-response.schema.js';
import {
  accountActionAcceptedResponseSchema,
  accountActionTokenSchema,
} from './account-action.schema.js';
import { accountEmailSchema } from './public-account.schema.js';

const emailVerifiedDataSchema = z
  .object({
    verified: z.literal(true),
  })
  .strict();

export const requestEmailVerificationRequestSchema = z
  .object({
    email: accountEmailSchema,
  })
  .strict();

export const requestEmailVerificationResponseSchema = accountActionAcceptedResponseSchema;

export const confirmEmailVerificationRequestSchema = z
  .object({
    token: accountActionTokenSchema,
  })
  .strict();

export const confirmEmailVerificationResponseSchema =
  createSuccessResponseSchema(emailVerifiedDataSchema);

export type RequestEmailVerificationRequest = z.infer<typeof requestEmailVerificationRequestSchema>;
export type RequestEmailVerificationResponse = z.infer<
  typeof requestEmailVerificationResponseSchema
>;
export type ConfirmEmailVerificationRequest = z.infer<typeof confirmEmailVerificationRequestSchema>;
export type ConfirmEmailVerificationResponse = z.infer<
  typeof confirmEmailVerificationResponseSchema
>;
