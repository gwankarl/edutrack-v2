import {
  errorResponseSchema,
  loginResponseSchema,
  logoutResponseSchema,
  registrationResponseSchema,
} from '@edutrack/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEnvironment } from '../../../infrastructure/config/environment.js';
import { AppError } from '../../../infrastructure/errors/app-error.js';
import { ERROR_CODES } from '../../../infrastructure/errors/error-codes.js';
import { createApp } from '../../../app/create-app.js';

const mocks = vi.hoisted(() => ({
  registerStudent: vi.fn(),
  loginAccount: vi.fn(),
  revokeLoginSession: vi.fn(),
  authenticateSessionToken: vi.fn(),
  logoutSession: vi.fn(),
}));

vi.mock('../registration/registration-service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../registration/registration-service.js')>();

  return {
    ...actual,
    registerStudent: mocks.registerStudent,
  };
});

vi.mock('./login-service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./login-service.js')>();

  return {
    ...actual,
    loginAccount: mocks.loginAccount,
    revokeLoginSession: mocks.revokeLoginSession,
  };
});

vi.mock('./session-authentication.service.js', () => ({
  authenticateSessionToken: mocks.authenticateSessionToken,
}));

vi.mock('./logout.service.js', () => ({ logoutSession: mocks.logoutSession }));

const TEST_DATABASE_URL = 'postgresql://test:test@localhost:5432/edutrack_test';
const accountData = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  displayName: 'Sample Student',
  email: 'student@example.test',
};
const sessionId = 'd9428888-122b-4b86-b1d4-6a4e4b3b8c11';
const sessionToken = 'synthetic-route-session-token';

function successfulLoginResult(expiresAt = new Date(Date.now() + 60_000)) {
  return {
    response: { success: true as const, data: accountData },
    session: { id: sessionId, expiresAt },
    sessionToken,
  };
}

describe('Accounts authentication routes', () => {
  const apps: ReturnType<typeof createApp>[] = [];

  function makeApp() {
    const app = createApp(
      parseEnvironment({
        NODE_ENV: 'test',
        DATABASE_URL: TEST_DATABASE_URL,
      }),
    );

    apps.push(app);
    return app;
  }

  beforeEach(() => {
    mocks.registerStudent.mockReset();
    mocks.loginAccount.mockReset();
    mocks.revokeLoginSession.mockReset();
    mocks.authenticateSessionToken.mockReset();
    mocks.logoutSession.mockReset();
    mocks.revokeLoginSession.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('registers through the service and returns a 201 contract response without cookies', async () => {
    mocks.registerStudent.mockResolvedValue({
      success: true,
      data: accountData,
    });

    const app = makeApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        displayName: '  Sample Student ',
        email: ' STUDENT@Example.test ',
        password: 'a sufficiently long password',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(registrationResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(response.json()).toEqual({ success: true, data: accountData });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(mocks.registerStudent).toHaveBeenCalledWith(
      {
        displayName: 'Sample Student',
        email: 'student@example.test',
        password: 'a sufficiently long password',
      },
      expect.objectContaining({
        assertDeliveryAvailable: expect.any(Function),
        sendForAccount: expect.any(Function),
      }),
    );
    expect(JSON.stringify(response.json())).not.toContain('passwordHash');
  });

  it('returns the shared validation error for malformed registration fields', async () => {
    const app = makeApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        displayName: '',
        email: 'not-an-email',
        password: 'short',
      },
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
    expect(mocks.registerStudent).not.toHaveBeenCalled();
  });

  it('logs in through the service and sets the raw token only in an HTTP-only cookie', async () => {
    mocks.loginAccount.mockResolvedValue(successfulLoginResult());

    const app = makeApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: ' STUDENT@Example.test ',
        password: 'submitted password',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(loginResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(response.json()).toEqual({ success: true, data: accountData });
    const cookie = String(response.headers['set-cookie']);
    expect(cookie).toContain(`edutrack_session=${sessionToken}`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toMatch(/;\s*Secure(?:;|$)/i);
    expect(mocks.loginAccount).toHaveBeenCalledWith({
      email: 'student@example.test',
      password: 'submitted password',
    });
    expect(JSON.stringify(response.json())).not.toContain('passwordHash');
    expect(JSON.stringify(response.json())).not.toContain('submitted password');
    expect(JSON.stringify(response.json())).not.toContain(sessionToken);
  });

  it('returns the shared validation error for malformed bodies and rejected role fields', async () => {
    const app = makeApp();

    const missingPassword = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'student@example.test' },
    });

    expect(missingPassword.statusCode).toBe(400);
    expect(errorResponseSchema.safeParse(missingPassword.json()).success).toBe(true);
    expect(missingPassword.json()).toMatchObject({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Request validation failed.',
      },
    });

    const privilegedRegistration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        displayName: 'Sample Student',
        email: 'student@example.test',
        password: 'a sufficiently long password',
        role: 'administrator',
      },
    });

    expect(privilegedRegistration.statusCode).toBe(400);
    expect(errorResponseSchema.safeParse(privilegedRegistration.json()).success).toBe(true);
    expect(privilegedRegistration.json()).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.VALIDATION_ERROR },
    });
    expect(mocks.registerStudent).not.toHaveBeenCalled();
    expect(mocks.loginAccount).not.toHaveBeenCalled();
  });

  it('uses the standardized conflict response for duplicate registration', async () => {
    mocks.registerStudent.mockRejectedValue(
      new AppError(ERROR_CODES.CONFLICT, 409, 'An account with this email already exists.'),
    );

    const app = makeApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        displayName: 'Sample Student',
        email: 'student@example.test',
        password: 'a sufficiently long password',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(errorResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(response.json()).toMatchObject({
      success: false,
      error: {
        code: ERROR_CODES.CONFLICT,
        message: 'An account with this email already exists.',
      },
    });
  });

  it('returns the same standardized unauthorized response for invalid credentials', async () => {
    mocks.loginAccount.mockRejectedValue(
      new AppError(ERROR_CODES.UNAUTHORIZED, 401, 'Invalid email or password.'),
    );

    const app = makeApp();

    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'student@example.test', password: 'wrong password' },
    });

    const unknownEmail = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'unknown@example.test', password: 'wrong password' },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.headers['set-cookie']).toBeUndefined();
    expect(unknownEmail.headers['set-cookie']).toBeUndefined();
    expect(errorResponseSchema.safeParse(wrongPassword.json()).success).toBe(true);
    expect(errorResponseSchema.safeParse(unknownEmail.json()).success).toBe(true);
    expect(wrongPassword.json()).toEqual(unknownEmail.json());
    expect(JSON.stringify(wrongPassword.json())).not.toContain('wrong password');
  });

  it('returns a centralized failure and no cookie when session persistence fails', async () => {
    mocks.loginAccount.mockRejectedValue(new Error('Synthetic session persistence failure.'));

    const app = makeApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'student@example.test', password: 'submitted password' },
    });

    expect(response.statusCode).toBe(500);
    expect(errorResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(response.json()).toMatchObject({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_SERVER_ERROR,
        message: 'An unexpected error occurred.',
      },
    });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(response.json())).not.toContain('Synthetic session persistence failure.');
  });

  it('revokes a persisted session when cookie setup fails', async () => {
    mocks.loginAccount.mockResolvedValue(successfulLoginResult(new Date(0)));

    const app = makeApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'student@example.test', password: 'submitted password' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(mocks.revokeLoginSession).toHaveBeenCalledWith(sessionId);
    expect(errorResponseSchema.safeParse(response.json()).success).toBe(true);
  });

  it('returns the current user and database roles for an authenticated session', async () => {
    mocks.authenticateSessionToken.mockResolvedValue({
      ...accountData,
      roles: ['student'],
      sessionId,
    });

    const app = makeApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: `edutrack_session=${sessionToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: { ...accountData, roles: ['student'] },
    });
    expect(mocks.authenticateSessionToken).toHaveBeenCalledWith(sessionToken);
    expect(JSON.stringify(response.json())).not.toContain('sessionId');
    expect(JSON.stringify(response.json())).not.toContain('passwordHash');
    expect(JSON.stringify(response.json())).not.toContain(sessionToken);
  });

  it.each([
    ['missing', undefined],
    ['malformed', 'not-a-session-token'],
    ['expired', sessionToken],
    ['revoked', sessionToken],
  ])('rejects a %s session with the shared unauthorized response', async (_kind, token) => {
    mocks.authenticateSessionToken.mockRejectedValue(
      new AppError(ERROR_CODES.UNAUTHORIZED, 401, 'Authentication is required.'),
    );

    const app = makeApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      ...(token ? { headers: { cookie: `edutrack_session=${token}` } } : {}),
    });

    expect(response.statusCode).toBe(401);
    expect(errorResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(response.json()).toEqual({
      success: false,
      error: { code: ERROR_CODES.UNAUTHORIZED, message: 'Authentication is required.' },
    });
  });

  it('keeps public routes accessible without an authentication cookie', async () => {
    mocks.registerStudent.mockResolvedValue({ success: true, data: accountData });

    const app = makeApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        displayName: 'Sample Student',
        email: 'student@example.test',
        password: 'a sufficiently long password',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mocks.authenticateSessionToken).not.toHaveBeenCalled();
  });

  it('revokes through the service and clears the cookie using the shared success contract', async () => {
    const app = makeApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        cookie: `edutrack_session=${sessionToken}`,
        origin: 'http://localhost:5173',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(logoutResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(response.json()).toEqual({ success: true, data: { loggedOut: true } });
    expect(mocks.logoutSession).toHaveBeenCalledWith(sessionToken);

    const clearedCookie = String(response.headers['set-cookie']);
    expect(clearedCookie).toContain('edutrack_session=');
    expect(clearedCookie).toContain('HttpOnly');
    expect(clearedCookie).toContain('Path=/');
    expect(clearedCookie).toContain('SameSite=Lax');
    expect(clearedCookie).toContain('Max-Age=0');
    expect(clearedCookie).not.toContain(sessionToken);
    expect(JSON.stringify(response.json())).not.toContain(sessionToken);
  });

  it.each([undefined, 'malformed-token'])(
    'clears the cookie and succeeds for missing or invalid session token (%s)',
    async (token) => {
      const app = makeApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: {
          origin: 'http://localhost:5173',
          ...(token ? { cookie: `edutrack_session=${token}` } : {}),
        },
      });

      expect(response.statusCode).toBe(200);
      expect(logoutResponseSchema.safeParse(response.json()).success).toBe(true);
      expect(mocks.logoutSession).toHaveBeenCalledWith(token);
      expect(String(response.headers['set-cookie'])).toContain('Max-Age=0');
    },
  );

  it('rejects missing or foreign Origin headers before logout work', async () => {
    const app = makeApp();
    const missingOrigin = await app.inject({ method: 'POST', url: '/api/v1/auth/logout' });
    const foreignOrigin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { origin: 'https://untrusted.example.test' },
    });
    const crossSiteRequest = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        origin: 'http://localhost:5173',
        'sec-fetch-site': 'cross-site',
      },
    });

    for (const response of [missingOrigin, foreignOrigin, crossSiteRequest]) {
      expect(response.statusCode).toBe(403);
      expect(errorResponseSchema.safeParse(response.json()).success).toBe(true);
      expect(response.json()).toMatchObject({
        success: false,
        error: { code: ERROR_CODES.FORBIDDEN, message: 'Request origin is not allowed.' },
      });
    }
    expect(mocks.logoutSession).not.toHaveBeenCalled();
  });

  it('maps session persistence failures to safe centralized errors', async () => {
    const internalDatabaseDetail = 'synthetic database connection detail';
    const app = makeApp();

    mocks.authenticateSessionToken.mockRejectedValueOnce(new Error(internalDatabaseDetail));
    const currentUserFailure = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: `edutrack_session=${sessionToken}` },
    });

    mocks.logoutSession.mockRejectedValueOnce(new Error(internalDatabaseDetail));
    const logoutFailure = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        origin: 'http://localhost:5173',
        cookie: `edutrack_session=${sessionToken}`,
      },
    });

    for (const response of [currentUserFailure, logoutFailure]) {
      expect(response.statusCode).toBe(500);
      expect(errorResponseSchema.safeParse(response.json()).success).toBe(true);
      expect(response.json()).toMatchObject({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_SERVER_ERROR,
          message: 'An unexpected error occurred.',
        },
      });
      expect(response.body).not.toContain(internalDatabaseDetail);
      expect(response.body).not.toContain(sessionToken);
      expect(response.body).not.toContain('stack');
    }

    // Clearing occurs only after revocation succeeds.
    expect(logoutFailure.headers['set-cookie']).toBeUndefined();
  });
});
