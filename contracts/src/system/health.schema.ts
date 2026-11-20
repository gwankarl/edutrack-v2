import { z } from 'zod';
import { createSuccessResponseSchema } from '../common/index.js';

export const healthDataSchema = z
  .object({
    status: z.literal('ok'),
  })
  .strict();

export const healthResponseSchema = createSuccessResponseSchema(healthDataSchema);

export type HealthData = z.infer<typeof healthDataSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
