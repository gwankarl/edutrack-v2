import { z } from 'zod';
import { createSuccessResponseSchema } from '../common/api-response.schema.js';

// Matches a 32-byte unpadded base64url token; preserve its exact value.
export const accountActionTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

const acceptedDataSchema = z
  .object({
    accepted: z.literal(true),
  })
  .strict();

export const accountActionAcceptedResponseSchema = createSuccessResponseSchema(acceptedDataSchema);

export type AccountActionToken = z.infer<typeof accountActionTokenSchema>;
export type AccountActionAcceptedResponse = z.infer<typeof accountActionAcceptedResponseSchema>;
