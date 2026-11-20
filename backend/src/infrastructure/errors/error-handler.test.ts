import { afterEach, describe, expect, it } from 'vitest';
import { parseEnvironment } from '../config/environment.js';
import { errorResponseSchema } from '@edutrack/contracts';
import { createApp as createApplication } from '../../app/create-app.js';
import { AppError } from './app-error.js';
import { ERROR_CODES } from './error-codes.js';

const TEST_DATABASE_URL = 'postgresql://test:test@localhost:5432/edutrack_test';

describe('centralized error handling', () => {
  const apps: ReturnType<typeof createApplication>[] = [];

  function createApp() {
    const app = createApplication(
      parseEnvironment({ NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL }),
    );
    apps.push(app);
    return app;
  }

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('maps AppError to the shared error response contract', async () => {
    const app = createApp();

    app.get('/api/v1/test-known-error', async () => {
      throw new AppError(ERROR_CODES.NOT_FOUND, 404, 'Course was not found.');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/test-known-error',
    });

    expect(response.statusCode).toBe(404);
    expect(errorResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(response.json()).toMatchObject({
      success: false,
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: 'Course was not found.',
      },
    });
  });

  it('normalizes request validation failures and includes structured details', async () => {
    const app = createApp();

    app.post(
      '/api/v1/test-validation',
      {
        schema: {
          body: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
      },
      async () => ({ success: true }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/test-validation',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(errorResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(response.json()).toMatchObject({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Request validation failed.',
        details: expect.any(Array),
      },
    });
  });

  it('returns the shared not-found response for unmatched routes', async () => {
    const app = createApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/not-registered',
    });

    expect(response.statusCode).toBe(404);
    expect(errorResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.NOT_FOUND },
    });
  });

  it('logs unexpected failures and does not expose their details', async () => {
    const app = createApp();
    const secret = 'internal database connection detail';

    app.get('/api/v1/test-unexpected-error', async () => {
      throw new Error(secret);
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/test-unexpected-error',
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
    expect(response.body).not.toContain(secret);
    expect(response.body).not.toContain('stack');
  });
});
