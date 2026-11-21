import { describe, expect, it } from 'vitest';
import { updateProfileRequestSchema } from './index.js';

describe('profile update request contract', () => {
  it('accepts a valid display name', () => {
    expect(updateProfileRequestSchema.parse({ displayName: 'Ada N.' })).toEqual({
      displayName: 'Ada N.',
    });
  });

  it('trims surrounding whitespace', () => {
    expect(updateProfileRequestSchema.parse({ displayName: '  Ada N.  ' })).toEqual({
      displayName: 'Ada N.',
    });
  });

  it('rejects empty and whitespace-only names', () => {
    expect(updateProfileRequestSchema.safeParse({ displayName: '' }).success).toBe(false);
    expect(updateProfileRequestSchema.safeParse({ displayName: '   ' }).success).toBe(false);
  });

  it('accepts the maximum length and rejects longer names', () => {
    expect(updateProfileRequestSchema.safeParse({ displayName: 'A'.repeat(100) }).success).toBe(
      true,
    );
    expect(updateProfileRequestSchema.safeParse({ displayName: 'A'.repeat(101) }).success).toBe(
      false,
    );
  });

  it('rejects security-sensitive and otherwise unknown fields', () => {
    const forbiddenFields = [
      { email: 'ada@example.test' },
      { roles: ['administrator'] },
      { passwordHash: 'not-public' },
      { emailVerifiedAt: '2026-01-01T00:00:00.000Z' },
      { role: 'teacher' },
    ];

    for (const field of forbiddenFields) {
      expect(
        updateProfileRequestSchema.safeParse({
          displayName: 'Ada',
          ...field,
        }).success,
      ).toBe(false);
    }
  });
});
