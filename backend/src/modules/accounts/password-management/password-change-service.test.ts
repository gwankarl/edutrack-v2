import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../infrastructure/errors/error-codes.js';

const mocks = vi.hoisted(() => ({
  findPasswordChangeCredentials: vi.fn(),
  changePasswordAndRevokeSessions: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock('./password-change-repository.js', () => ({
  findPasswordChangeCredentials: mocks.findPasswordChangeCredentials,
  changePasswordAndRevokeSessions: mocks.changePasswordAndRevokeSessions,
}));

vi.mock('../../../infrastructure/security/password-hasher.js', () => ({
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword,
}));

import { changePassword } from './password-change-service.js';

const userId = '550e8400-e29b-41d4-a716-446655440000';
const storedHash = '$argon2id$stored-test-hash';
const newHash = '$argon2id$new-test-hash';
const currentPassword = 'current sufficiently long password';
const newPassword = 'new sufficiently long password';

describe('changePassword service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findPasswordChangeCredentials.mockResolvedValue({ passwordHash: storedHash });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.hashPassword.mockResolvedValue(newHash);
    mocks.changePasswordAndRevokeSessions.mockResolvedValue(true);
  });

  it('verifies, hashes, and persists the new password for the trusted account ID', async () => {
    const result = await changePassword(userId, { currentPassword, newPassword });

    expect(mocks.findPasswordChangeCredentials).toHaveBeenCalledWith(userId);
    expect(mocks.verifyPassword).toHaveBeenCalledWith(currentPassword, storedHash);
    expect(mocks.hashPassword).toHaveBeenCalledWith(newPassword);
    expect(mocks.changePasswordAndRevokeSessions).toHaveBeenCalledWith(userId, storedHash, newHash);
    expect(result).toEqual({ success: true, data: { passwordChanged: true } });
    expect(JSON.stringify(result)).not.toContain(currentPassword);
    expect(JSON.stringify(result)).not.toContain(newPassword);
    expect(JSON.stringify(result)).not.toContain(storedHash);
    expect(JSON.stringify(result)).not.toContain(newHash);
  });

  it('rejects an incorrect current password without hashing or updating', async () => {
    mocks.verifyPassword.mockResolvedValue(false);

    await expect(changePassword(userId, { currentPassword, newPassword })).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
      statusCode: 401,
      message: 'The current password is incorrect.',
    });
    expect(mocks.hashPassword).not.toHaveBeenCalled();
    expect(mocks.changePasswordAndRevokeSessions).not.toHaveBeenCalled();
  });

  it('rejects reusing the current password', async () => {
    await expect(
      changePassword(userId, {
        currentPassword,
        newPassword: currentPassword,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.BAD_REQUEST, statusCode: 400 });
    expect(mocks.hashPassword).not.toHaveBeenCalled();
    expect(mocks.changePasswordAndRevokeSessions).not.toHaveBeenCalled();
  });

  it('rejects new passwords outside the shared schema rules before database access', async () => {
    await expect(
      changePassword(userId, { currentPassword, newPassword: 'too-short' }),
    ).rejects.toHaveProperty('name', 'ZodError');
    expect(mocks.findPasswordChangeCredentials).not.toHaveBeenCalled();
    expect(mocks.hashPassword).not.toHaveBeenCalled();
  });

  it('rejects a concurrent change if the previously verified hash is stale', async () => {
    mocks.changePasswordAndRevokeSessions.mockResolvedValue(false);

    await expect(changePassword(userId, { currentPassword, newPassword })).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
      statusCode: 401,
      message: 'The current password is incorrect.',
    });
  });

  it('does not persist if Argon2 hashing fails', async () => {
    mocks.hashPassword.mockRejectedValue(new Error('Password hashing failed.'));

    await expect(changePassword(userId, { currentPassword, newPassword })).rejects.toThrow(
      'Password hashing failed.',
    );
    expect(mocks.changePasswordAndRevokeSessions).not.toHaveBeenCalled();
  });
});
