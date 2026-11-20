import { z } from 'zod';
import { requiredStringSchema } from './validation.schema.js';

export const validationDetailSchema = z
  .object({
    path: z.array(z.union([z.string(), z.number()])),
    code: requiredStringSchema,
    message: requiredStringSchema,
  })
  .strict();

export const errorResponseSchema = z
  .object({
    success: z.literal(false),
    error: z
      .object({
        code: requiredStringSchema,
        message: requiredStringSchema,
        details: z.array(validationDetailSchema).optional(),
      })
      .strict(),
  })
  .strict();

export type ValidationDetail = z.infer<typeof validationDetailSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
