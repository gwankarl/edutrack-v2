import { z } from 'zod';

const paginationIntegerStringSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, 'Expected a non-negative integer')
  .transform(Number)
  .pipe(z.number().int().safe());

export const paginationQuerySchema = z
  .object({
    limit: paginationIntegerStringSchema.pipe(z.number().int().min(1).max(100)).default(20),
    offset: paginationIntegerStringSchema.default(0),
  })
  .strict();

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
