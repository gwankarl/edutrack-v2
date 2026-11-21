import { describe, expect, it } from 'vitest';
import {
  confirmEmailVerificationRequestSchema,
  confirmEmailVerificationResponseSchema,
  requestEmailVerificationRequestSchema,
  requestEmailVerificationResponseSchema,
} from './email-verification.schema.js';

const validToken = 'A'.repeat(43);

describe('email verification contracts', () => {
  it('normalizes the email on verification requests', () => {
    expect(
      requestEmailVerificationRequestSchema.parse({
        email: '  Student@Example.test ',
      }),
    ).toEqual({ email: 'student@example.test' });
  });

  it('rejects malformed email and extra request fields', () => {
    expect(
      requestEmailVerificationRequestSchema.safeParse({
        email: 'not-an-email',
      }).success,
    ).toBe(false);

    expect(
      requestEmailVerificationRequestSchema.safeParse({
        email: 'student@example.test',
        userId: '550e8400-e29b-41d4-a716-446655440000',
      }).success,
    ).toBe(false);
  });

  it('uses the same generic accepted response regardless of account existence', () => {
    const response = { success: true, data: { accepted: true } };

    expect(requestEmailVerificationResponseSchema.safeParse(response).success).toBe(true);
    expect(
      requestEmailVerificationResponseSchema.safeParse({
        ...response,
        data: { accepted: true, email: 'student@example.test' },
      }).success,
    ).toBe(false);
  });

  it('accepts an opaque token and rejects malformed confirmation input', () => {
    expect(confirmEmailVerificationRequestSchema.safeParse({ token: validToken }).success).toBe(
      true,
    );
    expect(confirmEmailVerificationRequestSchema.safeParse({ token: 'short' }).success).toBe(false);
    expect(
      confirmEmailVerificationRequestSchema.safeParse({
        token: validToken,
        email: 'student@example.test',
      }).success,
    ).toBe(false);
  });

  it('returns only a verified flag after confirmation', () => {
    expect(
      confirmEmailVerificationResponseSchema.safeParse({
        success: true,
        data: { verified: true },
      }).success,
    ).toBe(true);

    expect(
      confirmEmailVerificationResponseSchema.safeParse({
        success: true,
        data: { verified: true, tokenHash: 'private' },
      }).success,
    ).toBe(false);
  });
});
