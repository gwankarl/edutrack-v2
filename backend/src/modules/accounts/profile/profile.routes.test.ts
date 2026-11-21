import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticateSessionToken: vi.fn(),
  updateProfile: vi.fn(),
  findAccountWithRolesById: vi.fn(),
}));

vi.mock('../authentication/session-authentication.service.js', () => ({
  authenticateSessionToken: mocks.authenticateSessionToken,
}));

vi.mock('./profile-repository.js', () => ({
  updateProfile: mocks.updateProfile,
}));

vi.mock('../account-repository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../account-repository.js')>();

  return {
    ...actual,
    findAccountWithRolesById: mocks.findAccountWithRolesById,
  };
});

import { currentUserResponseSchema, errorResponseSchema } from '@edutrack/contracts';
import { createApp } from '../../../app/create-app.js';
import { AppError } from '../../../infrastructure/errors/app-error.js';
import { parseEnvironment } from '../../../infrastructure/config/environment.js';
import { ERROR_CODES } from '../../../infrastructure/errors/error-codes.js';

const userId = '550e8400-e29b-41d4-a716-446655440000';
const sessionId = 'd9428888-122b-4b86-b1d4-6a4e4b3b8c11';
const frontendOrigin = 'http://localhost:5173';
const sessionToken = 'A'.repeat(43);

const testEnvironment = parseEnvironment({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/edutrack_test',
});

describe('authenticated profile update route', () => {
  const apps: ReturnType<typeof createApp>[] = [];

  function makeApp() {
    const app = createApp(testEnvironment);
    apps.push(app);
    return app;
  }

  beforeEach(() => {
    vi.resetAllMocks();

    mocks.authenticateSessionToken.mockResolvedValue({
      id: userId,
      displayName: 'Old Name',
      email: 'ada@example.test',
      roles: ['student'],
      sessionId,
    });

    mocks.updateProfile.mockResolvedValue({
      id: userId,
      displayName: 'New Name',
      email: 'ada@example.test',
    });

    // This simulates a fresh database lookup. The role differs from the
    // authentication context to ensure PATCH does not return stale roles.
    mocks.findAccountWithRolesById.mockResolvedValue({
      id: userId,
      displayName: 'New Name',
      email: 'ada@example.test',
      roles: ['student', 'teacher'],
    });
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('updates the authenticated user and returns the current-user contract', async () => {
    const response = await makeApp().inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      headers: {
        origin: frontendOrigin,
        cookie: `edutrack_session=${sessionToken}`,
      },
      payload: { displayName: '  New Name  ' },
    });

    expect(response.statusCode).toBe(200);
    expect(currentUserResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(response.json()).toEqual({
      success: true,
      data: {
        id: userId,
        displayName: 'New Name',
        email: 'ada@example.test',
        roles: ['student', 'teacher'],
      },
    });
    expect(mocks.updateProfile).toHaveBeenCalledWith(userId, {
      displayName: 'New Name',
    });
    expect(mocks.findAccountWithRolesById).toHaveBeenCalledWith(userId);
    expect(response.body).not.toContain('passwordHash');
    expect(response.body).not.toContain(sessionToken);
  });

  it.each([
    ['empty display name', { displayName: '   ' }],
    ['email', { displayName: 'New Name', email: 'attacker@example.test' }],
    ['roles', { displayName: 'New Name', roles: ['administrator'] }],
    ['password hash', { displayName: 'New Name', passwordHash: 'not-allowed' }],
    ['verification state', { displayName: 'New Name', emailVerifiedAt: null }],
    ['oversized display name', { displayName: 'A'.repeat(101) }],
    ['user ID', { displayName: 'New Name', userId: 'd9428888-122b-4b86-b1d4-6a4e4b3b8c11' }],
    ['owner ID', { displayName: 'New Name', ownerUserId: 'd9428888-122b-4b86-b1d4-6a4e4b3b8c11' }],
    ['password', { displayName: 'New Name', password: 'not-allowed' }],
  ])('rejects invalid profile input containing %s', async (_label, payload) => {
    const response = await makeApp().inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      headers: {
        origin: frontendOrigin,
        cookie: `edutrack_session=${sessionToken}`,
      },
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(errorResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(response.json()).toMatchObject({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Request validation failed.',
      },
    });
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['malformed', 'not-valid'],
    ['expired', sessionToken],
    ['revoked', sessionToken],
  ])('rejects a %s session without changing the profile', async (_state, token) => {
    mocks.authenticateSessionToken.mockRejectedValueOnce(
      new AppError(ERROR_CODES.UNAUTHORIZED, 401, 'Authentication is required.'),
    );

    const response = await makeApp().inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      headers: {
        origin: frontendOrigin,
        ...(token ? { cookie: `edutrack_session=${token}` } : {}),
      },
      payload: { displayName: 'New Name' },
    });

    expect(response.statusCode).toBe(401);
    expect(errorResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(response.json()).toMatchObject({
      success: false,
      error: {
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Authentication is required.',
      },
    });
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it('rejects missing, foreign, and cross-site origins before authentication or update', async () => {
    const app = makeApp();

    const missingOrigin = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      headers: { cookie: `edutrack_session=${sessionToken}` },
      payload: { displayName: 'New Name' },
    });

    const foreignOrigin = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      headers: {
        origin: 'https://untrusted.example.test',
        cookie: `edutrack_session=${sessionToken}`,
      },
      payload: { displayName: 'New Name' },
    });

    const crossSite = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      headers: {
        origin: frontendOrigin,
        'sec-fetch-site': 'cross-site',
        cookie: `edutrack_session=${sessionToken}`,
      },
      payload: { displayName: 'New Name' },
    });

    for (const response of [missingOrigin, foreignOrigin, crossSite]) {
      expect(response.statusCode).toBe(403);
      expect(errorResponseSchema.safeParse(response.json()).success).toBe(true);
    }

    expect(mocks.authenticateSessionToken).not.toHaveBeenCalled();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it('returns the standardized not-found response for an unavailable user', async () => {
    mocks.updateProfile.mockResolvedValueOnce(undefined);

    const response = await makeApp().inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      headers: {
        origin: frontendOrigin,
        cookie: `edutrack_session=${sessionToken}`,
      },
      payload: { displayName: 'New Name' },
    });

    expect(response.statusCode).toBe(404);
    expect(errorResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.NOT_FOUND },
    });
  });

  it('routes service failures through centralized safe error handling', async () => {
    mocks.updateProfile.mockRejectedValueOnce(new Error('Synthetic database connection detail.'));

    const response = await makeApp().inject({
      method: 'PATCH',
      url: '/api/v1/auth/me',
      headers: {
        origin: frontendOrigin,
        cookie: `edutrack_session=${sessionToken}`,
      },
      payload: { displayName: 'New Name' },
    });

    expect(response.statusCode).toBe(500);
    expect(errorResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(response.body).not.toContain('Synthetic database connection detail.');
  });
});
