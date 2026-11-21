import { describe, expect, it } from 'vitest';
import { registrationRequestSchema, registrationResponseSchema } from './index.js';

describe('registration contracts', () => {
  it('trims identity fields and normalizes email', () => {
    expect(
      registrationRequestSchema.parse({
        displayName: '  Ada N.  ',
        email: '  Student@Example.test ',
        password: '  an example passphrase  ',
      }),
    ).toEqual({
      displayName: 'Ada N.',
      email: 'student@example.test',
      password: '  an example passphrase  ',
    });
  });

  it('rejects privileged roles and other unknown request fields', () => {
    expect(
      registrationRequestSchema.safeParse({
        displayName: 'Ada',
        email: 'ada@example.test',
        password: 'a sufficiently long password',
        role: 'administrator',
      }).success,
    ).toBe(false);
  });

  it('enforces password length without trimming its value', () => {
    expect(
      registrationRequestSchema.safeParse({
        displayName: 'Ada',
        email: 'ada@example.test',
        password: 'short',
      }).success,
    ).toBe(false);

    expect(
      registrationRequestSchema.safeParse({
        displayName: 'Ada',
        email: 'ada@example.test',
        password: 'x'.repeat(129),
      }).success,
    ).toBe(false);
  });

  it('accepts a success response with only safe account data', () => {
    expect(
      registrationResponseSchema.safeParse({
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          displayName: 'Ada',
          email: 'ada@example.test',
        },
      }).success,
    ).toBe(true);
  });

  it('rejects password hashes, tokens, and unknown response fields', () => {
    expect(
      registrationResponseSchema.safeParse({
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          displayName: 'Ada',
          email: 'ada@example.test',
          passwordHash: 'must-not-be-returned',
        },
      }).success,
    ).toBe(false);
  });
});
