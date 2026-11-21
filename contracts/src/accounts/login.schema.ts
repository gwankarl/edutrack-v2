import { z } from 'zod';
import { createSuccessResponseSchema } from '../common/api-response.schema.js';
import type { ApiResponse } from '../common/api-response.schema.js';
import { accountEmailSchema, publicAccountSchema } from './public-account.schema.js';

export const loginRequestSchema = z
  .object({
    email: accountEmailSchema,
    password: z.string().min(1).max(128),
  })
  .strict();

export const loginResponseSchema = createSuccessResponseSchema(publicAccountSchema);

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type LoginApiResponse = ApiResponse<typeof publicAccountSchema>;
