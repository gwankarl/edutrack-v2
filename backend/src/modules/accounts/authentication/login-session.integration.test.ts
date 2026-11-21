import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  currentUserResponseSchema,
  errorResponseSchema,
  loginResponseSchema,
  logoutResponseSchema,
} from '@edutrack/contracts';
import { createApp } from '../../../app/create-app.js';
import {
  parseEnvironment,
  type BackendEnvironment,
} from '../../../infrastructure/config/environment.js';
import {
  createDatabaseClient,
  getDatabaseClient,
} from '../../../infrastructure/database/client.js';
import {
  closeDatabaseConnection,
  initializeDatabaseConnection,
} from '../../../infrastructure/database/connection.js';
import { sessions } from '../../../infrastructure/database/schema/accounts/sessions.table.js';
import { userRoles } from '../../../infrastructure/database/schema/accounts/user-roles.table.js';
import { users } from '../../../infrastructure/database/schema/accounts/users.table.js';
import { AUTH_SESSION_COOKIE_NAME } from '../../../infrastructure/security/auth-cookie.js';
import { hashPassword } from '../../../infrastructure/security/password-hasher.js';
import { SESSION_LIFETIME_MS } from '../../../infrastructure/security/session-policy.js';
import { hashSessionToken } from '../../../infrastructure/security/session-token.js';
import { generateSessionToken } from '../../../infrastructure/security/session-token.js';

const TEST_DATABASE_NAME = 'edutrack_test';
const createdUserIds: string[] = [];
const apps: ReturnType<typeof createApp>[] = [];

let pool: Pool | undefined;
let testEnvironment: BackendEnvironment | undefined;

function requirePool(): Pool {
  if (!pool) {
    throw new Error('Login session integration pool was not initialized.');
  }

  return pool;
}

function requireEnvironment(): BackendEnvironment {
  if (!testEnvironment) {
    throw new Error('Login session integration environment was not initialized.');
  }

  return testEnvironment;
}

function requireTestDatabaseUrl(): URL {
  const configuredUrl = process.env.DATABASE_TEST_URL;

  if (!configuredUrl) {
    throw new Error('Set DATABASE_TEST_URL to the dedicated edutrack_test database.');
  }

  try {
    const url = new URL(configuredUrl);
    const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

    if (
      !/^postgres(?:ql)?:$/i.test(url.protocol) ||
      databaseName !== TEST_DATABASE_NAME ||
      !['localhost', '127.0.0.1', '::1'].includes(hostname)
    ) {
      throw new Error('Invalid test database target.');
    }

    const applicationUrl = process.env.DATABASE_URL;

    if (applicationUrl) {
      const application = new URL(applicationUrl);
      const applicationHostname = application.hostname.toLowerCase().replace(/^\[|\]$/g, '');
      const testTarget = `${hostname}:${url.port || '5432'}/${databaseName}`;
      const applicationTarget =
        `${applicationHostname}:${application.port || '5432'}/` +
        decodeURIComponent(application.pathname.replace(/^\/+/, ''));

      if (testTarget === applicationTarget) {
        throw new Error('Test and application database targets are identical.');
      }
    }

    return url;
  } catch {
    throw new Error(
      'Refusing login session tests: DATABASE_TEST_URL must target a separate local edutrack_test database.',
    );
  }
}

async function createLoginUser(password: string): Promise<{ id: string; email: string }> {
  const email = `login-session-${randomUUID()}@example.test`;
  const [user] = await getDatabaseClient()
    .insert(users)
    .values({
      displayName: 'Login Session Integration User',
      email,
      passwordHash: await hashPassword(password),
    })
    .returning({ id: users.id });

  if (!user) {
    throw new Error('Failed to create a login session integration user.');
  }

  createdUserIds.push(user.id);
  return { id: user.id, email };
}

function makeApp() {
  const app = createApp(requireEnvironment());
  apps.push(app);
  return app;
}

beforeAll(async () => {
  const testUrl = requireTestDatabaseUrl();
  testEnvironment = parseEnvironment({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: testUrl.toString(),
  });
  pool = initializeDatabaseConnection(testEnvironment);

  // Confirm the PostgreSQL server target before any synthetic records are written.
  const identity = await requirePool().query<{ database_name: string }>(
    'SELECT current_database() AS database_name',
  );

  if (identity.rows[0]?.database_name !== TEST_DATABASE_NAME) {
    throw new Error('Refusing login session tests: PostgreSQL did not report edutrack_test.');
  }

  createDatabaseClient(requirePool());
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));

  if (createdUserIds.length > 0) {
    const ids = [...createdUserIds];
    await getDatabaseClient().delete(users).where(inArray(users.id, ids));
    createdUserIds.splice(0, ids.length);
  }
});

afterAll(async () => {
  try {
    if (pool && createdUserIds.length > 0) {
      await createDatabaseClient(pool)
        .delete(users)
        .where(inArray(users.id, [...createdUserIds]));
      createdUserIds.length = 0;
    }
  } finally {
    await closeDatabaseConnection();
    pool = undefined;
  }
});

describe('Login session integration', () => {
  it('persists only a token hash and returns the session token only as an aligned cookie', async () => {
    const password = 'integration login passphrase';
    const { id: userId, email } = await createLoginUser(password);
    const response = await makeApp().inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email,
        password,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(loginResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(response.json()).toMatchObject({
      success: true,
      data: { id: userId, displayName: 'Login Session Integration User' },
    });

    const setCookie = response.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookieHeader).toBeDefined();
    expect(cookieHeader).toContain(`${AUTH_SESSION_COOKIE_NAME}=`);
    expect(cookieHeader).toContain('HttpOnly');
    expect(cookieHeader).toContain('Path=/');
    expect(cookieHeader).toContain('SameSite=Lax');

    const rawToken = cookieHeader?.match(new RegExp(`^${AUTH_SESSION_COOKIE_NAME}=([^;]+)`))?.[1];
    expect(rawToken).toBeDefined();
    expect(response.body).not.toContain(rawToken as string);
    expect(response.body).not.toContain('passwordHash');
    expect(response.body).not.toContain(password);

    const tokenHash = hashSessionToken(rawToken as string);
    const [storedSession] = await getDatabaseClient()
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash));

    expect(storedSession).toMatchObject({ userId, tokenHash, revokedAt: null });
    expect(storedSession?.tokenHash).not.toBe(rawToken);

    const cookieExpiry = Date.parse(cookieHeader?.match(/Expires=([^;]+)/i)?.[1] ?? '');
    const maxAge = Number(cookieHeader?.match(/Max-Age=(\d+)/i)?.[1]);
    expect(Number.isFinite(cookieExpiry)).toBe(true);
    expect(Math.abs(cookieExpiry - (storedSession?.expiresAt.getTime() ?? 0))).toBeLessThan(1000);
    expect(storedSession?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(storedSession?.expiresAt.getTime()).toBeLessThanOrEqual(
      storedSession!.createdAt.getTime() + SESSION_LIFETIME_MS,
    );
    expect(maxAge).toBeGreaterThan(0);
    expect(maxAge).toBeLessThanOrEqual(SESSION_LIFETIME_MS / 1000);
  });

  it('issues no session or cookie for an incorrect password or unknown account', async () => {
    const { id: userId, email } = await createLoginUser('valid integration passphrase');
    const app = makeApp();

    const incorrectPassword = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email,
        password: 'incorrect integration passphrase',
      },
    });
    const unknownAccount = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'missing-login-session@example.test',
        password: 'incorrect integration passphrase',
      },
    });

    expect(incorrectPassword.statusCode).toBe(401);
    expect(unknownAccount.statusCode).toBe(401);
    expect(incorrectPassword.json()).toEqual(unknownAccount.json());
    expect(incorrectPassword.headers['set-cookie']).toBeUndefined();
    expect(unknownAccount.headers['set-cookie']).toBeUndefined();

    const createdSessions = await getDatabaseClient()
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, userId));
    expect(createdSessions).toHaveLength(0);
  });

  it('authenticates the session cookie and returns only the account and persisted roles', async () => {
    const { id: userId } = await createLoginUser('integration current-user passphrase');
    await getDatabaseClient().insert(userRoles).values({ userId, role: 'student' });
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);

    await getDatabaseClient()
      .insert(sessions)
      .values({
        userId,
        tokenHash: hashSessionToken(token),
        expiresAt,
      });

    const response = await makeApp().inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(currentUserResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(response.json()).toEqual({
      success: true,
      data: {
        id: userId,
        displayName: 'Login Session Integration User',
        email: expect.stringMatching(/^login-session-/),
        roles: ['student'],
      },
    });
    expect(response.body).not.toContain(token);
    expect(response.body).not.toContain('passwordHash');
    expect(response.body).not.toContain('sessionId');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('returns the same unauthorized contract for expired and revoked sessions', async () => {
    const { id: userId } = await createLoginUser('integration inactive session passphrase');
    await getDatabaseClient().insert(userRoles).values({ userId, role: 'student' });

    const expiredToken = generateSessionToken();
    const revokedToken = generateSessionToken();
    const now = Date.now();
    const expiredAt = new Date(now - 60_000);

    await getDatabaseClient()
      .insert(sessions)
      .values([
        {
          userId,
          tokenHash: hashSessionToken(expiredToken),
          createdAt: new Date(now - 120_000),
          expiresAt: expiredAt,
        },
        {
          userId,
          tokenHash: hashSessionToken(revokedToken),
          expiresAt: new Date(now + SESSION_LIFETIME_MS),
          revokedAt: new Date(now - 1_000),
        },
      ]);

    const app = makeApp();
    const expiredResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=${expiredToken}` },
    });
    const revokedResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=${revokedToken}` },
    });

    for (const response of [expiredResponse, revokedResponse]) {
      expect(response.statusCode).toBe(401);
      expect(errorResponseSchema.safeParse(response.json()).success).toBe(true);
      expect(response.json()).toMatchObject({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication is required.',
        },
      });
    }

    expect(expiredResponse.json()).toEqual(revokedResponse.json());
    expect(expiredResponse.body).not.toContain(expiredToken);
    expect(revokedResponse.body).not.toContain(revokedToken);
  });

  it('logs out only the current session and makes logout safely repeatable', async () => {
    const { id: userId } = await createLoginUser('integration logout passphrase');
    await getDatabaseClient().insert(userRoles).values({ userId, role: 'student' });
    const token = generateSessionToken();
    const otherToken = generateSessionToken();
    const expiredToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
    const expiredAt = new Date(Date.now() - 60_000);
    const expiredCreatedAt = new Date(expiredAt.getTime() - 60_000);

    await getDatabaseClient()
      .insert(sessions)
      .values([
        { userId, tokenHash: hashSessionToken(token), expiresAt },
        { userId, tokenHash: hashSessionToken(otherToken), expiresAt },
        {
          userId,
          tokenHash: hashSessionToken(expiredToken),
          createdAt: expiredCreatedAt,
          expiresAt: expiredAt,
        },
      ]);

    const app = makeApp();
    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        origin: 'http://localhost:5173',
        cookie: `${AUTH_SESSION_COOKIE_NAME}=${token}`,
      },
    });

    expect(logout.statusCode).toBe(200);
    expect(logoutResponseSchema.safeParse(logout.json()).success).toBe(true);
    expect(logout.json()).toEqual({ success: true, data: { loggedOut: true } });
    const clearedCookie = String(logout.headers['set-cookie']);
    expect(clearedCookie).toContain(`${AUTH_SESSION_COOKIE_NAME}=`);
    expect(clearedCookie).toContain('Max-Age=0');
    expect(clearedCookie).not.toContain(token);
    expect(logout.body).not.toContain(token);

    const revokedSession = await getDatabaseClient()
      .select({ revokedAt: sessions.revokedAt })
      .from(sessions)
      .where(eq(sessions.tokenHash, hashSessionToken(token)))
      .limit(1);
    expect(revokedSession[0]?.revokedAt).toBeInstanceOf(Date);

    const rejectedCurrentSession = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=${token}` },
    });
    expect(rejectedCurrentSession.statusCode).toBe(401);

    const retainedOtherSession = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=${otherToken}` },
    });
    expect(retainedOtherSession.statusCode).toBe(200);

    const repeatedLogout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        origin: 'http://localhost:5173',
        cookie: `${AUTH_SESSION_COOKIE_NAME}=${token}`,
      },
    });
    expect(repeatedLogout.statusCode).toBe(200);
    expect(repeatedLogout.json()).toEqual({ success: true, data: { loggedOut: true } });

    const missingCookieLogout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(missingCookieLogout.statusCode).toBe(200);
    expect(String(missingCookieLogout.headers['set-cookie'])).toContain('Max-Age=0');

    const expiredCookieLogout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        origin: 'http://localhost:5173',
        cookie: `${AUTH_SESSION_COOKIE_NAME}=${expiredToken}`,
      },
    });
    expect(expiredCookieLogout.statusCode).toBe(200);
    expect(String(expiredCookieLogout.headers['set-cookie'])).toContain('Max-Age=0');
  });
});
