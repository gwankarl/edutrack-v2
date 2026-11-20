import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createSuccessResponseSchema, uuidSchema } from '../index.js';

describe('createSuccessResponseSchema', () => {
  const dataSchema = z.object({ id: uuidSchema }).strict();
  const successSchema = createSuccessResponseSchema(dataSchema);

  it('accepts valid domain data', () => {
    expect(
      successSchema.safeParse({
        success: true,
        data: { id: '550e8400-e29b-41d4-a716-446655440000' },
      }).success,
    ).toBe(true);
  });

  it('rejects invalid data and extra response fields', () => {
    expect(successSchema.safeParse({ success: true, data: { id: 'bad' } }).success).toBe(false);
    expect(
      successSchema.safeParse({
        success: true,
        data: { id: '550e8400-e29b-41d4-a716-446655440000' },
        status: 200,
      }).success,
    ).toBe(false);
  });

  it('rejects the wrong success discriminator', () => {
    expect(
      successSchema.safeParse({
        success: false,
        data: { id: '550e8400-e29b-41d4-a716-446655440000' },
      }).success,
    ).toBe(false);
  });
});
