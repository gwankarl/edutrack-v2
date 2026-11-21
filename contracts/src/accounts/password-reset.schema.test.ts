import { describe, expect, it } from 'vitest';
import {
  completePasswordResetRequestSchema,
  completePasswordResetResponseSchema,
  requestPasswordResetRequestSchema,
  requestPasswordResetResponseSchema,
} from './password-reset.schema.js';

const validToken = 'B'.repeat(43);

describe('password reset contracts', () => {
  it('normalizes the email and uses a generic accepted response', () => {
    expect(
      requestPasswordResetRequestSchema.parse({
        email: '  Student@Example.test ',
      }),
    ).toEqual({ email: 'student@example.test' });

    expect(
      requestPasswordResetResponseSchema.safeParse({
        success: true,
        data: { accepted: true },
      }).success,
    ).toBe(true);
  });

  it('requires a valid token and a new password within the shared policy', () => {
    expect(
      completePasswordResetRequestSchema.safeParse({
        token: validToken,
        newPassword: 'a new secure passphrase',
      }).success,
    ).toBe(true);

    expect(
      completePasswordResetRequestSchema.safeParse({
        token: 'invalid',
        newPassword: 'a new secure passphrase',
      }).success,
    ).toBe(false);

    expect(
      completePasswordResetRequestSchema.safeParse({
        token: validToken,
        newPassword: 'too-short',
      }).success,
    ).toBe(false);
  });

  it('rejects extra request fields and returns no token or password data', () => {
    expect(
      completePasswordResetRequestSchema.safeParse({
        token: validToken,
        newPassword: 'a new secure passphrase',
        userId: '550e8400-e29b-41d4-a716-446655440000',
      }).success,
    ).toBe(false);

    expect(
      completePasswordResetResponseSchema.safeParse({
        success: true,
        data: { passwordReset: true },
      }).success,
    ).toBe(true);

    expect(
      completePasswordResetResponseSchema.safeParse({
        success: true,
        data: { passwordReset: true, passwordHash: 'private' },
      }).success,
    ).toBe(false);
  });
});
