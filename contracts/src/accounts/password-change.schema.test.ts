import { describe, expect, it } from 'vitest';
import {
  changePasswordRequestSchema,
  changePasswordResponseSchema,
} from './password-change.schema.js';

describe('password change contracts', () => {
  it('accepts current and new passwords without trimming either value', () => {
    const input = {
      currentPassword: '  existing password  ',
      newPassword: '  a sufficiently long new password  ',
    };

    expect(changePasswordRequestSchema.parse(input)).toEqual(input);
  });

  it('enforces the existing-password and new-password length rules', () => {
    expect(
      changePasswordRequestSchema.safeParse({
        currentPassword: '',
        newPassword: 'a sufficiently long new password',
      }).success,
    ).toBe(false);

    expect(
      changePasswordRequestSchema.safeParse({
        currentPassword: 'existing password',
        newPassword: 'short',
      }).success,
    ).toBe(false);
  });

  it('rejects token fields and returns no credential data', () => {
    expect(
      changePasswordRequestSchema.safeParse({
        currentPassword: 'existing password',
        newPassword: 'a sufficiently long new password',
        token: 'not-expected-here',
      }).success,
    ).toBe(false);

    expect(
      changePasswordResponseSchema.safeParse({
        success: true,
        data: { passwordChanged: true },
      }).success,
    ).toBe(true);

    expect(
      changePasswordResponseSchema.safeParse({
        success: true,
        data: {
          passwordChanged: true,
          sessionToken: 'private',
        },
      }).success,
    ).toBe(false);
  });
});
