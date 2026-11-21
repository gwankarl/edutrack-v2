import type { AuthenticationAccountRecord } from './account-repository.js';
import type { CreateSessionInput } from './session-repository.js';
import { AppError } from '../../infrastructure/errors/app-error.js';
import { ERROR_CODES } from '../../infrastructure/errors/error-codes.js';
import { SESSION_LIFETIME_MS } from '../../infrastructure/security/session-policy.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findAccountForAuthenticationByEmail: vi.fn(),
  verifyPassword: vi.fn(),
  createSession: vi.fn(),
  revokeSessionById: vi.fn(),
  generateSessionToken: vi.fn(),
  hashSessionToken: vi.fn(),
}));

vi.mock('./account-repository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./account-repository.js')>();

  return {
    ...actual,
    findAccountForAuthenticationByEmail: mocks.findAccountForAuthenticationByEmail,
  };
});

vi.mock('./session-repository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./session-repository.js')>();

  return {
    ...actual,
    createSession: mocks.createSession,
    revokeSessionById: mocks.revokeSessionById,
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

vi.mock('../../infrastructure/security/session-token.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../infrastructure/security/session-token.js')>();

  return {
    ...actual,
    generateSessionToken: mocks.generateSessionToken,
    hashSessionToken: mocks.hashSessionToken,
  };
});

import { loginAccount, revokeLoginSession } from './login-service.js';

const account = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  displayName: 'Sample Student',
  email: 'student@example.test',
  passwordHash: '$argon2id$internal-test-hash',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
} satisfies AuthenticationAccountRecord;

const sessionId = 'd9428888-122b-4b86-b1d4-6a4e4b3b8c11';
const rawToken = 'synthetic-raw-session-token';
const tokenHash = 'f'.repeat(64);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-01T12:00:00.000Z'));
  vi.resetAllMocks();

  mocks.generateSessionToken.mockReturnValue(rawToken);
  mocks.hashSessionToken.mockReturnValue(tokenHash);
  mocks.createSession.mockImplementation((input: CreateSessionInput) =>
    Promise.resolve({
      id: sessionId,
      userId: input.userId,
      createdAt: new Date(),
      expiresAt: input.expiresAt,
      revokedAt: null,
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('login service', () => {
  it('normalizes email, verifies credentials, and persists a hashed-token session', async () => {
    mocks.findAccountForAuthenticationByEmail.mockResolvedValue(account);
    mocks.verifyPassword.mockResolvedValue(true);

    const result = await loginAccount({
      email: '  STUDENT@Example.test ',
      password: 'exact password value',
    });

    expect(mocks.findAccountForAuthenticationByEmail).toHaveBeenCalledWith('student@example.test');
    expect(mocks.verifyPassword).toHaveBeenCalledWith('exact password value', account.passwordHash);
    expect(mocks.generateSessionToken).toHaveBeenCalledOnce();
    expect(mocks.hashSessionToken).toHaveBeenCalledWith(rawToken);
    expect(mocks.createSession).toHaveBeenCalledWith({
      userId: account.id,
      tokenHash,
      expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
    });
    expect(result.response).toEqual({
      success: true,
      data: {
        id: account.id,
        displayName: account.displayName,
        email: account.email,
      },
    });
    expect(result.session).toMatchObject({ id: sessionId });
    expect(result.sessionToken).toBe(rawToken);
    expect(JSON.stringify(result.response)).not.toContain(rawToken);
    expect(JSON.stringify(result.response)).not.toContain(tokenHash);
    expect(JSON.stringify(result.response)).not.toContain(account.passwordHash);
  });

  it('returns the generic authentication error for an unknown email without creating a session', async () => {
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
    expect(mocks.generateSessionToken).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('returns the same generic authentication error for a wrong password without creating a session', async () => {
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

    expect(mocks.generateSessionToken).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('does not return success when session persistence fails', async () => {
    const persistenceError = new Error('Synthetic session persistence failure.');
    mocks.findAccountForAuthenticationByEmail.mockResolvedValue(account);
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.createSession.mockRejectedValue(persistenceError);

    await expect(
      loginAccount({ email: 'student@example.test', password: 'correct password' }),
    ).rejects.toBe(persistenceError);
  });

  it('delegates failed-cookie session cleanup to the session repository', async () => {
    mocks.revokeSessionById.mockResolvedValue(true);

    await expect(revokeLoginSession(sessionId)).resolves.toBeUndefined();
    expect(mocks.revokeSessionById).toHaveBeenCalledWith(sessionId);
  });

  it('does not expose credentials or account details in invalid-credential errors', async () => {
    mocks.findAccountForAuthenticationByEmail.mockResolvedValue(account);
    mocks.verifyPassword.mockResolvedValue(false);

    let failure: unknown;

    try {
      await loginAccount({
        email: account.email,
        password: 'sensitive submitted password',
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AppError);
    const errorMessage = (failure as Error).message;
    expect(errorMessage).not.toContain('sensitive submitted password');
    expect(errorMessage).not.toContain(account.passwordHash);
    expect(errorMessage).not.toContain(account.email);
  });
});
