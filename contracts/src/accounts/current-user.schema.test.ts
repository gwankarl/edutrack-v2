import { describe, expect, it } from 'vitest';
import { currentUserResponseSchema } from './current-user.schema.js';

describe('current user response contract', () => {
  it('accepts safe account data and the supported roles', () => {
    expect(
      currentUserResponseSchema.safeParse({
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          displayName: 'Sample Student',
          email: 'student@example.test',
          roles: ['student', 'teacher'],
        },
      }).success,
    ).toBe(true);
  });

  it('rejects unknown roles and internal security fields', () => {
    const base = {
      success: true,
      data: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        displayName: 'Sample Student',
        email: 'student@example.test',
        roles: ['student'],
      },
    };

    expect(
      currentUserResponseSchema.safeParse({
        ...base,
        data: { ...base.data, roles: ['observer'] },
      }).success,
    ).toBe(false);

    expect(
      currentUserResponseSchema.safeParse({
        ...base,
        data: { ...base.data, passwordHash: 'not-public' },
      }).success,
    ).toBe(false);
  });
});
