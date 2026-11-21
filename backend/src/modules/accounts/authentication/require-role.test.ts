import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { accountRoleValues, errorResponseSchema, type AccountRole } from '@edutrack/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerErrorHandlers } from '../../../infrastructure/errors/error-handler.js';
import { AppError } from '../../../infrastructure/errors/app-error.js';
import { ERROR_CODES } from '../../../infrastructure/errors/error-codes.js';
import { requireAuthentication } from './require-authentication.js';

const mocks = vi.hoisted(() => ({
  authenticateSessionToken: vi.fn(),
}));

vi.mock('./session-authentication.service.js', () => ({
  authenticateSessionToken: mocks.authenticateSessionToken,
}));

import { requireRole } from './require-role.js';

const userId = '550e8400-e29b-41d4-a716-446655440000';
const sessionId = 'd9428888-122b-4b86-b1d4-6a4e4b3b8c11';
const sessionToken = 'A'.repeat(43);

function makeApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  registerErrorHandlers(app);
  app.register(cookie, { hook: 'onRequest' });

  return app;
}

function addProtectedRoute(
  app: FastifyInstance,
  url: string,
  permittedRoles: [AccountRole, ...AccountRole[]],
  options: { method?: 'GET' | 'POST'; authenticate?: boolean } = {},
): void {
  const roleGuard = requireRole(...permittedRoles);
  const hooks = options.authenticate === false ? roleGuard : [requireAuthentication, roleGuard];

  app.route({
    method: options.method ?? 'GET',
    url,
    preHandler: hooks,
    handler: async () => ({ success: true, data: { authorized: true } }),
  });
}

describe('requireRole', () => {
  const apps: FastifyInstance[] = [];

  function createTestApp(): FastifyInstance {
    const app = makeApp();
    apps.push(app);
    return app;
  }

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authenticateSessionToken.mockResolvedValue({
      id: userId,
      displayName: 'Sample User',
      email: 'user@example.test',
      roles: ['student'],
      sessionId,
    });
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it.each(accountRoleValues)(
    'allows an authenticated %s when that role is explicitly permitted',
    async (role) => {
      mocks.authenticateSessionToken.mockResolvedValue({
        id: userId,
        displayName: 'Sample User',
        email: 'user@example.test',
        roles: [role],
        sessionId,
      });

      const app = createTestApp();
      addProtectedRoute(app, '/protected', [role]);

      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: { cookie: `edutrack_session=${sessionToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true, data: { authorized: true } });
    },
  );

  it('allows a user with multiple roles when any permitted role matches', async () => {
    mocks.authenticateSessionToken.mockResolvedValue({
      id: userId,
      displayName: 'Sample User',
      email: 'user@example.test',
      roles: ['student', 'teacher'],
      sessionId,
    });

    const app = createTestApp();
    addProtectedRoute(app, '/teacher-tools', ['teacher', 'administrator']);

    const response = await app.inject({
      method: 'GET',
      url: '/teacher-tools',
      headers: { cookie: `edutrack_session=${sessionToken}` },
    });

    expect(response.statusCode).toBe(200);
  });

  it('applies a role revocation on the next request using the same session', async () => {
    mocks.authenticateSessionToken
      .mockResolvedValueOnce({
        id: userId,
        displayName: 'Sample User',
        email: 'user@example.test',
        roles: ['student', 'teacher'],
        sessionId,
      })
      .mockResolvedValueOnce({
        id: userId,
        displayName: 'Sample User',
        email: 'user@example.test',
        roles: ['student'],
        sessionId,
      });

    const app = createTestApp();
    addProtectedRoute(app, '/teacher-tools', ['teacher']);
    const headers = { cookie: `edutrack_session=${sessionToken}` };

    const beforeRevocation = await app.inject({
      method: 'GET',
      url: '/teacher-tools',
      headers,
    });
    const afterRevocation = await app.inject({
      method: 'GET',
      url: '/teacher-tools',
      headers,
    });

    expect(beforeRevocation.statusCode).toBe(200);
    expect(afterRevocation.statusCode).toBe(403);
    expect(mocks.authenticateSessionToken).toHaveBeenCalledTimes(2);
  });

  it('returns the shared 403 response when the user lacks a permitted role', async () => {
    const app = createTestApp();
    addProtectedRoute(app, '/teacher-tools', ['teacher']);

    const response = await app.inject({
      method: 'GET',
      url: '/teacher-tools',
      headers: { cookie: `edutrack_session=${sessionToken}` },
    });

    expect(response.statusCode).toBe(403);
    expect(errorResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(response.json()).toMatchObject({
      success: false,
      error: {
        code: ERROR_CODES.FORBIDDEN,
        message: 'The request is not permitted.',
      },
    });
  });

  it('does not implicitly grant an Administrator access to a Student-only route', async () => {
    mocks.authenticateSessionToken.mockResolvedValue({
      id: userId,
      displayName: 'Sample Administrator',
      email: 'admin@example.test',
      roles: ['administrator'],
      sessionId,
    });

    const app = createTestApp();
    addProtectedRoute(app, '/student-tools', ['student']);

    const response = await app.inject({
      method: 'GET',
      url: '/student-tools',
      headers: { cookie: `edutrack_session=${sessionToken}` },
    });

    expect(response.statusCode).toBe(403);
  });

  it('returns the shared 401 response when session authentication fails', async () => {
    mocks.authenticateSessionToken.mockRejectedValueOnce(
      new AppError(ERROR_CODES.UNAUTHORIZED, 401, 'Authentication is required.'),
    );

    const app = createTestApp();
    addProtectedRoute(app, '/protected', ['student']);

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
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
    expect(mocks.authenticateSessionToken).toHaveBeenCalledWith(undefined);
  });

  it('returns 401 if the role guard is used without an authenticated context', async () => {
    const app = createTestApp();
    addProtectedRoute(app, '/protected-without-auth-hook', ['student'], {
      authenticate: false,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/protected-without-auth-hook',
    });

    expect(response.statusCode).toBe(401);
    expect(errorResponseSchema.safeParse(response.json()).success).toBe(true);
  });

  it('does not trust a role submitted by the client', async () => {
    const app = createTestApp();
    addProtectedRoute(app, '/admin-action', ['administrator'], { method: 'POST' });

    const response = await app.inject({
      method: 'POST',
      url: '/admin-action',
      headers: { cookie: `edutrack_session=${sessionToken}` },
      payload: {
        roles: ['administrator'],
        userId,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(mocks.authenticateSessionToken).toHaveBeenCalledWith(sessionToken);
  });
});
