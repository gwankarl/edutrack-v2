import {
  errorResponseSchema,
  loginResponseSchema,
  registrationResponseSchema,
} from '@edutrack/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEnvironment } from '../../infrastructure/config/environment.js';
import { AppError } from '../../infrastructure/errors/app-error.js';
import { ERROR_CODES } from '../../infrastructure/errors/error-codes.js';
import { createApp } from '../../app/create-app.js';

const mocks = vi.hoisted(() => ({
  registerStudent: vi.fn(),
  loginAccount: vi.fn(),
}));

vi.mock('./registration-service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./registration-service.js')>();

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
  };
});

const TEST_DATABASE_URL = 'postgresql://test:test@localhost:5432/edutrack_test';
const accountData = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  displayName: 'Sample Student',
  email: 'student@example.test',
};

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
    expect(mocks.registerStudent).toHaveBeenCalledWith({
      displayName: 'Sample Student',
      email: 'student@example.test',
      password: 'a sufficiently long password',
    });
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

  it('logs in through the service and returns a 200 contract response without cookies', async () => {
    mocks.loginAccount.mockResolvedValue({
      success: true,
      data: accountData,
    });

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
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(mocks.loginAccount).toHaveBeenCalledWith({
      email: 'student@example.test',
      password: 'submitted password',
    });
    expect(JSON.stringify(response.json())).not.toContain('passwordHash');
    expect(JSON.stringify(response.json())).not.toContain('submitted password');
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
    expect(errorResponseSchema.safeParse(wrongPassword.json()).success).toBe(true);
    expect(errorResponseSchema.safeParse(unknownEmail.json()).success).toBe(true);
    expect(wrongPassword.json()).toEqual(unknownEmail.json());
    expect(JSON.stringify(wrongPassword.json())).not.toContain('wrong password');
  });
});
