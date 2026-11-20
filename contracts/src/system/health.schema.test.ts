import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '../index.js';

describe('healthResponseSchema', () => {
  it('accepts the healthy success response', () => {
    expect(
      healthResponseSchema.safeParse({
        success: true,
        data: { status: 'ok' },
      }).success,
    ).toBe(true);
  });

  it('rejects other statuses and unexpected response fields', () => {
    expect(
      healthResponseSchema.safeParse({
        success: true,
        data: { status: 'degraded' },
      }).success,
    ).toBe(false);

    expect(
      healthResponseSchema.safeParse({
        success: true,
        data: { status: 'ok' },
        statusCode: 200,
      }).success,
    ).toBe(false);
  });
});
