import type { UpdateProfileRequest } from '@edutrack/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  findAccountWithRolesById: vi.fn(),
}));

vi.mock('./profile-repository.js', () => ({
  updateProfile: mocks.updateProfile,
}));

vi.mock('../account-repository.js', () => ({
  findAccountWithRolesById: mocks.findAccountWithRolesById,
}));

import { ERROR_CODES } from '../../../infrastructure/errors/error-codes.js';
import { updateUserProfile } from './profile-service.js';

const userId = '550e8400-e29b-41d4-a716-446655440000';

describe('profile service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('updates the display name and returns the current user with database roles', async () => {
    mocks.updateProfile.mockResolvedValue({
      id: userId,
      displayName: 'Ada N.',
      email: 'ada@example.test',
    });
    mocks.findAccountWithRolesById.mockResolvedValue({
      id: userId,
      displayName: 'Ada N.',
      email: 'ada@example.test',
      roles: ['student'],
    });

    await expect(updateUserProfile(userId, { displayName: '  Ada N.  ' })).resolves.toEqual({
      success: true,
      data: {
        id: userId,
        displayName: 'Ada N.',
        email: 'ada@example.test',
        roles: ['student'],
      },
    });

    expect(mocks.updateProfile).toHaveBeenCalledWith(userId, { displayName: 'Ada N.' });
    expect(mocks.findAccountWithRolesById).toHaveBeenCalledWith(userId);
  });

  it('returns a controlled not-found error when the user does not exist', async () => {
    mocks.updateProfile.mockResolvedValue(undefined);

    await expect(updateUserProfile(userId, { displayName: 'Ada' })).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
      statusCode: 404,
    });

    expect(mocks.findAccountWithRolesById).not.toHaveBeenCalled();
  });

  it('does not return a profile if the account disappears before role lookup', async () => {
    mocks.updateProfile.mockResolvedValue({
      id: userId,
      displayName: 'Ada',
      email: 'ada@example.test',
    });
    mocks.findAccountWithRolesById.mockResolvedValue(undefined);

    await expect(updateUserProfile(userId, { displayName: 'Ada' })).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
      statusCode: 404,
    });
  });

  it('rejects protected fields before repository access', async () => {
    const input = {
      displayName: 'Ada',
      email: 'attacker@example.test',
      roles: ['administrator'],
      passwordHash: 'not-allowed',
      emailVerifiedAt: new Date(),
    } as unknown as UpdateProfileRequest;

    await expect(updateUserProfile(userId, input)).rejects.toThrow();

    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it('propagates persistence failures without returning a profile', async () => {
    const databaseError = new Error('Synthetic database failure.');
    mocks.updateProfile.mockRejectedValue(databaseError);

    await expect(updateUserProfile(userId, { displayName: 'Ada' })).rejects.toBe(databaseError);

    expect(mocks.findAccountWithRolesById).not.toHaveBeenCalled();
  });
});
