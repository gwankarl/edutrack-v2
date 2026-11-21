import {
  changePasswordResponseSchema,
  completePasswordResetResponseSchema,
  confirmEmailVerificationResponseSchema,
  errorResponseSchema,
  requestEmailVerificationResponseSchema,
  requestPasswordResetResponseSchema,
} from '@edutrack/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../infrastructure/errors/app-error.js';
import { ERROR_CODES } from '../../../infrastructure/errors/error-codes.js';

const mocks = vi.hoisted(() => ({
  requestVerification: vi.fn(),
  confirmVerification: vi.fn(),
  requestReset: vi.fn(),
  completeReset: vi.fn(),
  changePassword: vi.fn(),
  authenticateSessionToken: vi.fn(),
}));

vi.mock('../email-verification/email-verification-workflow-service.js', () => ({
  createEmailVerificationWorkflow: () => ({
    assertDeliveryAvailable: vi.fn(),
    sendForAccount: vi.fn(),
    requestVerification: mocks.requestVerification,
    confirmVerification: mocks.confirmVerification,
  }),
}));

vi.mock('../password-management/password-reset-workflow-service.js', () => ({
  createPasswordResetWorkflow: () => ({
    requestReset: mocks.requestReset,
    completeReset: mocks.completeReset,
  }),
}));

vi.mock('../password-management/password-change-service.js', () => ({
  changePassword: mocks.changePassword,
}));

vi.mock('./session-authentication.service.js', () => ({
  authenticateSessionToken: mocks.authenticateSessionToken,
}));

import { createApp } from '../../../app/create-app.js';
import { parseEnvironment } from '../../../infrastructure/config/environment.js';

const frontendOrigin = 'http://localhost:5173';
const token = 'A'.repeat(43);
const userId = '550e8400-e29b-41d4-a716-446655440000';
const testEnvironment = parseEnvironment({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/edutrack_test',
});

describe('account security routes', () => {
  const apps: ReturnType<typeof createApp>[] = [];

  function makeApp() {
    const app = createApp(testEnvironment);
    apps.push(app);
    return app;
  }

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requestVerification.mockResolvedValue({ success: true, data: { accepted: true } });
    mocks.confirmVerification.mockResolvedValue({ success: true, data: { verified: true } });
    mocks.requestReset.mockResolvedValue({ success: true, data: { accepted: true } });
    mocks.completeReset.mockResolvedValue({ success: true, data: { passwordReset: true } });
    mocks.changePassword.mockResolvedValue({ success: true, data: { passwordChanged: true } });
    mocks.authenticateSessionToken.mockResolvedValue({
      id: userId,
      displayName: 'Sample Student',
      email: 'student@example.test',
      roles: ['student'],
      sessionId: 'd9428888-122b-4b86-b1d4-6a4e4b3b8c11',
    });
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('accepts an email-verification request with the generic shared response', async () => {
    const response = await makeApp().inject({
      method: 'POST',
      url: '/api/v1/auth/email-verification/request',
      headers: { origin: frontendOrigin },
      payload: { email: 'student@example.test' },
    });

    expect(response.statusCode).toBe(200);
    expect(requestEmailVerificationResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(response.json()).toEqual({ success: true, data: { accepted: true } });
    expect(mocks.requestVerification).toHaveBeenCalledWith({ email: 'student@example.test' });
  });

  it('confirms an email-verification token through the workflow', async () => {
    const response = await makeApp().inject({
      method: 'POST',
      url: '/api/v1/auth/email-verification/confirm',
      headers: { origin: frontendOrigin },
      payload: { token },
    });

    expect(response.statusCode).toBe(200);
    expect(confirmEmailVerificationResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(mocks.confirmVerification).toHaveBeenCalledWith({ token });
    expect(response.body).not.toContain(token);
  });

  it('returns the generic response for password recovery requests', async () => {
    const response = await makeApp().inject({
      method: 'POST',
      url: '/api/v1/auth/password/forgot',
      headers: { origin: frontendOrigin },
      payload: { email: 'unknown@example.test' },
    });

    expect(response.statusCode).toBe(200);
    expect(requestPasswordResetResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(response.json()).toEqual({ success: true, data: { accepted: true } });
    expect(mocks.requestReset).toHaveBeenCalledWith({ email: 'unknown@example.test' });
  });

  it('completes password reset without setting an authentication cookie', async () => {
    const password = 'a sufficiently long replacement password';
    const response = await makeApp().inject({
      method: 'POST',
      url: '/api/v1/auth/password/reset',
      headers: { origin: frontendOrigin },
      payload: { token, newPassword: password },
    });

    expect(response.statusCode).toBe(200);
    expect(completePasswordResetResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(mocks.completeReset).toHaveBeenCalledWith({ token, newPassword: password });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.body).not.toContain(token);
    expect(response.body).not.toContain(password);
  });

  it('changes the authenticated user password and clears the session cookie', async () => {
    const currentPassword = 'a sufficiently long current password';
    const newPassword = 'a sufficiently long replacement password';
    const response = await makeApp().inject({
      method: 'POST',
      url: '/api/v1/auth/password/change',
      headers: {
        origin: frontendOrigin,
        cookie: 'edutrack_session=synthetic-session-token',
      },
      payload: { currentPassword, newPassword },
    });

    expect(response.statusCode).toBe(200);
    expect(changePasswordResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(mocks.changePassword).toHaveBeenCalledWith(userId, { currentPassword, newPassword });
    expect(String(response.headers['set-cookie'])).toContain('Max-Age=0');
    expect(response.body).not.toContain(currentPassword);
    expect(response.body).not.toContain(newPassword);
  });

  it('returns the shared validation error for malformed request bodies', async () => {
    const response = await makeApp().inject({
      method: 'POST',
      url: '/api/v1/auth/password/forgot',
      headers: { origin: frontendOrigin },
      payload: { email: 'not-an-email' },
    });

    expect(response.statusCode).toBe(400);
    expect(errorResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(mocks.requestReset).not.toHaveBeenCalled();
  });

  it.each([
    [
      'email verification request',
      '/api/v1/auth/email-verification/request',
      { email: 'not-an-email' },
    ],
    [
      'email verification confirmation',
      '/api/v1/auth/email-verification/confirm',
      { token: 'bad' },
    ],
    [
      'password reset',
      '/api/v1/auth/password/reset',
      { token: 'bad', newPassword: 'a sufficiently long replacement password' },
    ],
    [
      'password change',
      '/api/v1/auth/password/change',
      { newPassword: 'a sufficiently long replacement password' },
    ],
  ] as const)(
    'validates malformed %s requests using shared contracts',
    async (_name, url, payload) => {
      const response = await makeApp().inject({
        method: 'POST',
        url,
        headers: {
          origin: frontendOrigin,
          ...(url.endsWith('/password/change')
            ? { cookie: 'edutrack_session=synthetic-session-token' }
            : {}),
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
    },
  );

  it.each(['invalid', 'expired', 'consumed'])(
    'returns the same safe error for a %s email-verification token',
    async () => {
      mocks.confirmVerification.mockRejectedValueOnce(
        new AppError(
          ERROR_CODES.BAD_REQUEST,
          400,
          'The email verification token is invalid, expired, or already used.',
        ),
      );

      const response = await makeApp().inject({
        method: 'POST',
        url: '/api/v1/auth/email-verification/confirm',
        headers: { origin: frontendOrigin },
        payload: { token },
      });

      expect(response.statusCode).toBe(400);
      expect(errorResponseSchema.safeParse(response.json()).success).toBe(true);
      expect(response.json()).toMatchObject({
        success: false,
        error: {
          code: ERROR_CODES.BAD_REQUEST,
          message: 'The email verification token is invalid, expired, or already used.',
        },
      });
      expect(response.body).not.toContain(token);
    },
  );

  it.each(['invalid', 'expired', 'consumed'])(
    'returns the same safe error for a %s password-reset token',
    async () => {
      const newPassword = 'a sufficiently long replacement password';
      mocks.completeReset.mockRejectedValueOnce(
        new AppError(
          ERROR_CODES.BAD_REQUEST,
          400,
          'The password reset token is invalid, expired, or already used.',
        ),
      );

      const response = await makeApp().inject({
        method: 'POST',
        url: '/api/v1/auth/password/reset',
        headers: { origin: frontendOrigin },
        payload: { token, newPassword },
      });

      expect(response.statusCode).toBe(400);
      expect(errorResponseSchema.safeParse(response.json()).success).toBe(true);
      expect(response.body).not.toContain(token);
      expect(response.body).not.toContain(newPassword);
    },
  );

  it('does not clear the authentication cookie if password change fails', async () => {
    const currentPassword = 'a sufficiently long current password';
    const newPassword = 'a sufficiently long replacement password';
    mocks.changePassword.mockRejectedValueOnce(
      new AppError(ERROR_CODES.UNAUTHORIZED, 401, 'The current password is incorrect.'),
    );

    const response = await makeApp().inject({
      method: 'POST',
      url: '/api/v1/auth/password/change',
      headers: {
        origin: frontendOrigin,
        cookie: 'edutrack_session=synthetic-session-token',
      },
      payload: { currentPassword, newPassword },
    });

    expect(response.statusCode).toBe(401);
    expect(errorResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.body).not.toContain(currentPassword);
    expect(response.body).not.toContain(newPassword);
  });

  it('rejects foreign origins and missing authentication on password change', async () => {
    const app = makeApp();
    const payload = {
      currentPassword: 'a sufficiently long current password',
      newPassword: 'a sufficiently long replacement password',
    };

    const foreignOrigin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/change',
      headers: {
        origin: 'https://untrusted.example.test',
        cookie: 'edutrack_session=synthetic-session-token',
      },
      payload,
    });
    mocks.authenticateSessionToken.mockRejectedValueOnce(
      new AppError(ERROR_CODES.UNAUTHORIZED, 401, 'Authentication is required.'),
    );
    const missingSession = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/change',
      headers: { origin: frontendOrigin },
      payload,
    });

    expect(foreignOrigin.statusCode).toBe(403);
    expect(missingSession.statusCode).toBe(401);
    expect(errorResponseSchema.safeParse(foreignOrigin.json()).success).toBe(true);
    expect(errorResponseSchema.safeParse(missingSession.json()).success).toBe(true);
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });

  it('returns a shared error response when an IP rate limit is exceeded', async () => {
    const app = makeApp();
    let lastResponse;

    for (let index = 0; index < 6; index += 1) {
      lastResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/password/forgot',
        headers: { origin: frontendOrigin },
        payload: { email: 'student@example.test' },
      });
    }

    expect(lastResponse?.statusCode).toBe(429);
    expect(errorResponseSchema.safeParse(lastResponse?.json()).success).toBe(true);
    expect(lastResponse?.json()).toMatchObject({
      success: false,
      error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests.' },
    });
  });

  it('allows credentialed CORS requests from the configured frontend only', async () => {
    const response = await makeApp().inject({
      method: 'OPTIONS',
      url: '/api/v1/auth/password/change',
      headers: {
        origin: frontendOrigin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });

    expect(response.headers['access-control-allow-origin']).toBe(frontendOrigin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });
});
