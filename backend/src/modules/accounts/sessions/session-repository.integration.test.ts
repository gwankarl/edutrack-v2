import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { parseEnvironment } from '../../../infrastructure/config/environment.js';
import {
  createDatabaseClient,
  getDatabaseClient,
} from '../../../infrastructure/database/client.js';
import {
  closeDatabaseConnection,
  initializeDatabaseConnection,
} from '../../../infrastructure/database/connection.js';
import { sessions } from '../../../infrastructure/database/schema/accounts/sessions.table.js';
import { users } from '../../../infrastructure/database/schema/accounts/users.table.js';
import {
  generateSessionToken,
  hashSessionToken,
} from '../../../infrastructure/security/session-token.js';
import {
  createSession,
  findActiveSessionByTokenHash,
  revokeAllSessionsForUser,
  revokeSessionById,
  revokeSessionByTokenHash,
} from './session-repository.js';

const TEST_DATABASE_NAME = 'edutrack_test';
const createdUserIds: string[] = [];

let pool: Pool | undefined;

function requirePool(): Pool {
  if (!pool) {
    throw new Error('Session repository test pool was not initialized.');
  }

  return pool;
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
      'Refusing session repository tests: DATABASE_TEST_URL must target a separate local edutrack_test database.',
    );
  }
}

async function createTestUser(): Promise<string> {
  const email = `session-${randomUUID()}@example.test`;
  const [user] = await getDatabaseClient()
    .insert(users)
    .values({
      displayName: 'Session Integration User',
      email,
      passwordHash: 'test-only-placeholder-hash',
    })
    .returning({ id: users.id });

  if (!user) {
    throw new Error('Failed to create a session integration user.');
  }

  createdUserIds.push(user.id);
  return user.id;
}

function makeTokenHash(): string {
  return hashSessionToken(generateSessionToken());
}

async function createTestSession(userId: string) {
  const tokenHash = makeTokenHash();
  const session = await createSession({
    userId,
    tokenHash,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  return { session, tokenHash };
}

beforeAll(async () => {
  const testUrl = requireTestDatabaseUrl();
  const environment = parseEnvironment({
    ...process.env,
    DATABASE_URL: testUrl.toString(),
  });

  pool = initializeDatabaseConnection(environment);

  // Confirm the server-reported database before any test writes.
  const identity = await requirePool().query<{ database_name: string }>(
    'SELECT current_database() AS database_name',
  );

  if (identity.rows[0]?.database_name !== TEST_DATABASE_NAME) {
    throw new Error('Refusing session repository tests: PostgreSQL did not report edutrack_test.');
  }

  createDatabaseClient(requirePool());
});

afterEach(async () => {
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

describe('Session repository', () => {
  it('stores the token hash and returns session metadata without the hash', async () => {
    const userId = await createTestUser();
    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(rawToken);
    const session = await createSession({
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    expect(session).toMatchObject({ userId, revokedAt: null });
    expect(session).not.toHaveProperty('tokenHash');
    expect(session).not.toHaveProperty('rawToken');

    const [stored] = await getDatabaseClient()
      .select({ tokenHash: sessions.tokenHash })
      .from(sessions)
      .where(eq(sessions.id, session.id));

    expect(stored?.tokenHash).toBe(tokenHash);
    expect(stored?.tokenHash).not.toBe(rawToken);
  });

  it('finds an unexpired, unrevoked session by token hash', async () => {
    const userId = await createTestUser();
    const { session, tokenHash } = await createTestSession(userId);

    await expect(findActiveSessionByTokenHash(tokenHash)).resolves.toMatchObject({
      id: session.id,
      userId,
      revokedAt: null,
    });
  });

  it('does not return an expired session', async () => {
    const userId = await createTestUser();
    const expiresAt = new Date(Date.now() - 60 * 1000);

    // The table requires expiration to follow creation; both timestamps are in the past.
    const createdAt = new Date(expiresAt.getTime() - 60 * 1000);
    const tokenHash = makeTokenHash();

    await getDatabaseClient().insert(sessions).values({
      userId,
      tokenHash,
      createdAt,
      expiresAt,
    });

    await expect(findActiveSessionByTokenHash(tokenHash)).resolves.toBeUndefined();
  });

  it('revokes a specific session and makes it inactive', async () => {
    const userId = await createTestUser();
    const { session, tokenHash } = await createTestSession(userId);

    await expect(revokeSessionById(session.id)).resolves.toBe(true);
    await expect(revokeSessionById(session.id)).resolves.toBe(false);
    await expect(findActiveSessionByTokenHash(tokenHash)).resolves.toBeUndefined();
  });

  it('revokes a session by token hash idempotently without affecting another session', async () => {
    const userId = await createTestUser();
    const first = await createTestSession(userId);
    const second = await createTestSession(userId);

    await expect(revokeSessionByTokenHash(first.tokenHash)).resolves.toBe(true);
    await expect(revokeSessionByTokenHash(first.tokenHash)).resolves.toBe(false);
    await expect(findActiveSessionByTokenHash(first.tokenHash)).resolves.toBeUndefined();
    await expect(findActiveSessionByTokenHash(second.tokenHash)).resolves.toMatchObject({
      id: second.session.id,
      userId,
    });
  });

  it('supports multiple simultaneous sessions for a user', async () => {
    const userId = await createTestUser();
    const first = await createTestSession(userId);
    const second = await createTestSession(userId);

    expect(first.session.id).not.toBe(second.session.id);
    await expect(findActiveSessionByTokenHash(first.tokenHash)).resolves.toMatchObject({
      id: first.session.id,
      userId,
    });
    await expect(findActiveSessionByTokenHash(second.tokenHash)).resolves.toMatchObject({
      id: second.session.id,
      userId,
    });
  });

  it('revokes every unrevoked session for one user and leaves another user unchanged', async () => {
    const userId = await createTestUser();
    const otherUserId = await createTestUser();
    const first = await createTestSession(userId);
    const second = await createTestSession(userId);
    const other = await createTestSession(otherUserId);

    await expect(revokeAllSessionsForUser(userId)).resolves.toBe(2);
    await expect(findActiveSessionByTokenHash(first.tokenHash)).resolves.toBeUndefined();
    await expect(findActiveSessionByTokenHash(second.tokenHash)).resolves.toBeUndefined();
    await expect(findActiveSessionByTokenHash(other.tokenHash)).resolves.toMatchObject({
      id: other.session.id,
      userId: otherUserId,
    });
    await expect(revokeAllSessionsForUser(userId)).resolves.toBe(0);
  });
});
