import { z } from 'zod';
import { createSuccessResponseSchema } from '../common/api-response.schema.js';
import type { ApiResponse } from '../common/api-response.schema.js';
import {
  accountDisplayNameSchema,
  accountEmailSchema,
  publicAccountSchema,
} from './public-account.schema.js';

export const registrationRequestSchema = z
  .object({
    displayName: accountDisplayNameSchema,
    email: accountEmailSchema,
    password: z.string().min(12).max(128),
  })
  .strict();

export const registrationResponseSchema = createSuccessResponseSchema(publicAccountSchema);

export type RegistrationRequest = z.infer<typeof registrationRequestSchema>;
export type RegistrationResponse = z.infer<typeof registrationResponseSchema>;
export type RegistrationApiResponse = ApiResponse<typeof publicAccountSchema>;
