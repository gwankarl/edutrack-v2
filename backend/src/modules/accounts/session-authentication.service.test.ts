import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../infrastructure/errors/app-error.js';
import { ERROR_CODES } from '../../infrastructure/errors/error-codes.js';
import {
  generateSessionToken,
  hashSessionToken,
} from '../../infrastructure/security/session-token.js';

const mocks = vi.hoisted(() => ({
  findAccountWithRolesById: vi.fn(),
  findActiveSessionByTokenHash: vi.fn(),
}));

vi.mock('./account-repository.js', () => ({
  findAccountWithRolesById: mocks.findAccountWithRolesById,
}));

vi.mock('./session-repository.js', () => ({
  findActiveSessionByTokenHash: mocks.findActiveSessionByTokenHash,
}));

const userId = '550e8400-e29b-41d4-a716-446655440000';
const sessionId = 'd9428888-122b-4b86-b1d4-6a4e4b3b8c11';

describe('session authentication service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hashes the cookie token, checks the active session, and returns the database account roles', async () => {
    const token = generateSessionToken();
    mocks.findActiveSessionByTokenHash.mockResolvedValue({ id: sessionId, userId });
    mocks.findAccountWithRolesById.mockResolvedValue({
      id: userId,
      displayName: 'Test Student',
      email: 'student@example.test',
      roles: ['student', 'teacher'],
    });

    const { authenticateSessionToken } = await import('./session-authentication.service.js');
    await expect(authenticateSessionToken(token)).resolves.toEqual({
      id: userId,
      displayName: 'Test Student',
      email: 'student@example.test',
      roles: ['student', 'teacher'],
      sessionId,
    });
    expect(mocks.findActiveSessionByTokenHash).toHaveBeenCalledWith(hashSessionToken(token));
    expect(mocks.findAccountWithRolesById).toHaveBeenCalledWith(userId);
  });

  it.each([undefined, '', 'not-valid'])(
    'rejects missing or malformed tokens (%s)',
    async (token) => {
      const { authenticateSessionToken } = await import('./session-authentication.service.js');
      await expect(authenticateSessionToken(token)).rejects.toMatchObject({
        code: ERROR_CODES.UNAUTHORIZED,
        statusCode: 401,
        message: 'Authentication is required.',
      });
      expect(mocks.findActiveSessionByTokenHash).not.toHaveBeenCalled();
    },
  );

  it('rejects absent, expired, or revoked sessions through the active-session lookup', async () => {
    const token = generateSessionToken();
    mocks.findActiveSessionByTokenHash.mockResolvedValue(undefined);

    const { authenticateSessionToken } = await import('./session-authentication.service.js');
    await expect(authenticateSessionToken(token)).rejects.toBeInstanceOf(AppError);
    expect(mocks.findAccountWithRolesById).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    { id: userId, displayName: 'Test Student', email: 'student@example.test', roles: [] },
  ])('rejects deleted or ineligible accounts', async (account) => {
    const token = generateSessionToken();
    mocks.findActiveSessionByTokenHash.mockResolvedValue({ id: sessionId, userId });
    mocks.findAccountWithRolesById.mockResolvedValue(account);

    const { authenticateSessionToken } = await import('./session-authentication.service.js');
    await expect(authenticateSessionToken(token)).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
    });
  });
});
