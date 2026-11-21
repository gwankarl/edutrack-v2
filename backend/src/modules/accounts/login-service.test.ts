import type { AuthenticationAccountRecord } from './account-repository.js';
import { AppError } from '../../infrastructure/errors/app-error.js';
import { ERROR_CODES } from '../../infrastructure/errors/error-codes.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findAccountForAuthenticationByEmail: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock('./account-repository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./account-repository.js')>();

  return {
    ...actual,
    findAccountForAuthenticationByEmail: mocks.findAccountForAuthenticationByEmail,
  };
});

vi.mock('../../infrastructure/security/password-hasher.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../infrastructure/security/password-hasher.js')>();

  return {
    ...actual,
    verifyPassword: mocks.verifyPassword,
  };
});

import { loginAccount } from './login-service.js';

const account = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  displayName: 'Sample Student',
  email: 'student@example.test',
  passwordHash: '$argon2id$internal-test-hash',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
} satisfies AuthenticationAccountRecord;

beforeEach(() => {
  mocks.findAccountForAuthenticationByEmail.mockReset();
  mocks.verifyPassword.mockReset();
});

describe('login service', () => {
  it('normalizes email, verifies the password, and returns safe account data', async () => {
    mocks.findAccountForAuthenticationByEmail.mockResolvedValue(account);
    mocks.verifyPassword.mockResolvedValue(true);

    const response = await loginAccount({
      email: '  STUDENT@Example.test ',
      password: 'exact password value',
    });

    expect(mocks.findAccountForAuthenticationByEmail).toHaveBeenCalledWith('student@example.test');
    expect(mocks.verifyPassword).toHaveBeenCalledWith('exact password value', account.passwordHash);
    expect(response).toEqual({
      success: true,
      data: {
        id: account.id,
        displayName: account.displayName,
        email: account.email,
      },
    });
    expect(response.data).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(response)).not.toContain(account.passwordHash);
  });

  it('returns the generic authentication error for an unknown email', async () => {
    mocks.findAccountForAuthenticationByEmail.mockResolvedValue(undefined);

    await expect(
      loginAccount({ email: 'unknown@example.test', password: 'submitted password' }),
    ).rejects.toMatchObject({
      name: 'AppError',
      code: ERROR_CODES.UNAUTHORIZED,
      statusCode: 401,
      message: 'Invalid email or password.',
    });

    expect(mocks.verifyPassword).not.toHaveBeenCalled();
  });

  it('returns the same generic authentication error for an incorrect password', async () => {
    mocks.findAccountForAuthenticationByEmail.mockResolvedValue(account);
    mocks.verifyPassword.mockResolvedValue(false);

    await expect(
      loginAccount({ email: 'student@example.test', password: 'wrong password' }),
    ).rejects.toMatchObject({
      name: 'AppError',
      code: ERROR_CODES.UNAUTHORIZED,
      statusCode: 401,
      message: 'Invalid email or password.',
    });
  });

  it('does not expose the email, submitted password, or password hash in a failure', async () => {
    const submittedPassword = 'sensitive submitted password';
    mocks.findAccountForAuthenticationByEmail.mockResolvedValue(account);
    mocks.verifyPassword.mockResolvedValue(false);

    let failure: unknown;

    try {
      await loginAccount({
        email: 'student@example.test',
        password: submittedPassword,
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AppError);

    const errorMessage = (failure as Error).message;
    expect(errorMessage).not.toContain(submittedPassword);
    expect(errorMessage).not.toContain(account.passwordHash);
    expect(errorMessage).not.toContain(account.email);
  });
});
