import { z } from 'zod';
import type { ErrorResponse } from './api-error.schema.js';

export const createSuccessResponseSchema = <TDataSchema extends z.ZodType>(
  dataSchema: TDataSchema,
) =>
  z
    .object({
      success: z.literal(true),
      data: dataSchema,
    })
    .strict();

export type SuccessResponse<TDataSchema extends z.ZodType> = z.infer<
  ReturnType<typeof createSuccessResponseSchema<TDataSchema>>
>;

export type ApiResponse<TDataSchema extends z.ZodType> =
  SuccessResponse<TDataSchema> | ErrorResponse;
