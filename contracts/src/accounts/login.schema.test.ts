import { describe, expect, it } from 'vitest';
import { loginRequestSchema, loginResponseSchema } from './index.js';

describe('login contracts', () => {
  it('normalizes email and preserves the password exactly', () => {
    expect(
      loginRequestSchema.parse({
        email: '  Student@Example.test ',
        password: '  existing password  ',
      }),
    ).toEqual({
      email: 'student@example.test',
      password: '  existing password  ',
    });
  });

  it('rejects empty passwords and unknown request fields', () => {
    expect(
      loginRequestSchema.safeParse({
        email: 'student@example.test',
        password: '',
      }).success,
    ).toBe(false);

    expect(
      loginRequestSchema.safeParse({
        email: 'student@example.test',
        password: 'valid existing password',
        role: 'administrator',
      }).success,
    ).toBe(false);
  });

  it('accepts only safe account data in the success response', () => {
    expect(
      loginResponseSchema.safeParse({
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          displayName: 'Ada',
          email: 'ada@example.test',
        },
      }).success,
    ).toBe(true);

    expect(
      loginResponseSchema.safeParse({
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          displayName: 'Ada',
          email: 'ada@example.test',
          sessionToken: 'must-not-be-returned',
        },
      }).success,
    ).toBe(false);
  });
});
