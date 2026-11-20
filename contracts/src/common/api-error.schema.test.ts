import { describe, expect, it } from 'vitest';
import { errorResponseSchema } from '../index.js';

describe('errorResponseSchema', () => {
  const validError = {
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Check the request',
    },
  };

  it('accepts a standard error response without details', () => {
    expect(errorResponseSchema.safeParse(validError).success).toBe(true);
  });

  it('accepts structured validation details', () => {
    expect(
      errorResponseSchema.safeParse({
        ...validError,
        error: {
          ...validError.error,
          details: [
            {
              path: ['email'],
              code: 'invalid_format',
              message: 'Enter a valid email address',
            },
            {
              path: ['items', 0],
              code: 'too_small',
              message: 'At least one item is required',
            },
          ],
        },
      }).success,
    ).toBe(true);
  });

  it('rejects empty error codes or messages', () => {
    expect(
      errorResponseSchema.safeParse({
        success: false,
        error: { code: '', message: 'Check the request' },
      }).success,
    ).toBe(false);

    expect(
      errorResponseSchema.safeParse({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: ' ' },
      }).success,
    ).toBe(false);
  });

  it('rejects malformed validation details and unknown fields', () => {
    expect(
      errorResponseSchema.safeParse({
        ...validError,
        error: {
          ...validError.error,
          details: [{ path: ['email'], code: '', message: 'Invalid' }],
        },
      }).success,
    ).toBe(false);

    expect(
      errorResponseSchema.safeParse({
        ...validError,
        status: 400,
      }).success,
    ).toBe(false);
  });

  it('rejects an incorrect success discriminator', () => {
    expect(
      errorResponseSchema.safeParse({
        success: true,
        error: validError.error,
      }).success,
    ).toBe(false);
  });
});
