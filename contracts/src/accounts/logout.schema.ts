import { z } from 'zod';
import { createSuccessResponseSchema } from '../common/api-response.schema.js';

export const logoutResponseSchema = createSuccessResponseSchema(
  z
    .object({
      loggedOut: z.literal(true),
    })
    .strict(),
);

export type LogoutResponse = z.infer<typeof logoutResponseSchema>;
