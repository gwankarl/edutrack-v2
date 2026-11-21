import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Uuid } from '@edutrack/contracts';
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
import { userRoles } from '../../../infrastructure/database/schema/accounts/user-roles.table.js';
import { hashPassword } from '../../../infrastructure/security/password-hasher.js';
import {
  generateSessionToken,
  hashSessionToken,
} from '../../../infrastructure/security/session-token.js';
import { ERROR_CODES } from '../../../infrastructure/errors/error-codes.js';
import { loginAccount } from '../authentication/login-service.js';
import { changePassword } from './password-change-service.js';
import { createSession } from '../sessions/session-repository.js';

const TEST_DATABASE_NAME = 'edutrack_test';
const createdUserIds: Uuid[] = [];
let pool: Pool | undefined;

function requirePool(): Pool {
  if (!pool) throw new Error('Password-change integration test pool is not initialized.');
  return pool;
}

function requireTestDatabaseUrl(): URL {
  const configuredUrl = process.env.DATABASE_TEST_URL;
  if (!configuredUrl)
    throw new Error('Set DATABASE_TEST_URL to the dedicated edutrack_test database.');

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

    if (process.env.DATABASE_URL) {
      const application = new URL(process.env.DATABASE_URL);
      const applicationHost = application.hostname.toLowerCase().replace(/^\[|\]$/g, '');
      const testTarget = `${hostname}:${url.port || '5432'}/${databaseName}`;
      const applicationTarget =
        `${applicationHost}:${application.port || '5432'}/` +
        decodeURIComponent(application.pathname.replace(/^\/+/, ''));
      if (testTarget === applicationTarget) throw new Error('Application and test targets match.');
    }

    return url;
  } catch {
    throw new Error(
      'Refusing password-change tests: DATABASE_TEST_URL must target a separate local edutrack_test database.',
    );
  }
}

async function createTestUser(password: string): Promise<Uuid> {
  const [user] = await getDatabaseClient()
    .insert(users)
    .values({
      displayName: 'Password Change Integration User',
      email: `password-change-${randomUUID()}@example.test`,
      passwordHash: await hashPassword(password),
    })
    .returning({ id: users.id });

  if (!user) throw new Error('Could not create password-change integration user.');
  createdUserIds.push(user.id);
  return user.id;
}

async function createTestSession(userId: Uuid): Promise<void> {
  await createSession({
    userId,
    tokenHash: hashSessionToken(generateSessionToken()),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
}

beforeAll(async () => {
  const testUrl = requireTestDatabaseUrl();
  const environment = parseEnvironment({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: testUrl.toString(),
  });
  pool = initializeDatabaseConnection(environment);

  const identity = await requirePool().query<{ database_name: string }>(
    'SELECT current_database() AS database_name',
  );
  if (identity.rows[0]?.database_name !== TEST_DATABASE_NAME) {
    throw new Error('Refusing password-change tests: PostgreSQL did not report edutrack_test.');
  }

  createDatabaseClient(requirePool());
});

afterEach(async () => {
  if (createdUserIds.length > 0) {
    await getDatabaseClient()
      .delete(users)
      .where(inArray(users.id, [...createdUserIds]));
    createdUserIds.length = 0;
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

describe('password change integration', () => {
  it('changes credentials, revokes only this user’s sessions, and preserves account data', async () => {
    const oldPassword = 'current integration password';
    const newPassword = 'new integration password';
    const userId = await createTestUser(oldPassword);
    const otherUserId = await createTestUser('other integration password');
    const [profileBefore] = await getDatabaseClient()
      .select({ displayName: users.displayName, email: users.email })
      .from(users)
      .where(eq(users.id, userId));
    if (!profileBefore) throw new Error('Password change test account profile was not found.');
    const emailVerifiedAt = new Date(Date.now() - 60_000);

    await getDatabaseClient().update(users).set({ emailVerifiedAt }).where(eq(users.id, userId));
    await getDatabaseClient().insert(userRoles).values({ userId, role: 'student' });
    await createTestSession(userId);
    await createTestSession(userId);
    await createTestSession(otherUserId);

    const result = await changePassword(userId, {
      currentPassword: oldPassword,
      newPassword,
    });

    expect(result).toEqual({ success: true, data: { passwordChanged: true } });
    expect(JSON.stringify(result)).not.toContain(oldPassword);
    expect(JSON.stringify(result)).not.toContain(newPassword);

    const ownSessions = await getDatabaseClient()
      .select({ revokedAt: sessions.revokedAt })
      .from(sessions)
      .where(eq(sessions.userId, userId));
    expect(ownSessions).toHaveLength(2);
    expect(ownSessions.every((session) => session.revokedAt instanceof Date)).toBe(true);

    const otherSessions = await getDatabaseClient()
      .select({ revokedAt: sessions.revokedAt })
      .from(sessions)
      .where(eq(sessions.userId, otherUserId));
    expect(otherSessions).toHaveLength(1);
    expect(otherSessions[0]?.revokedAt).toBeNull();

    const [account] = await getDatabaseClient()
      .select({
        passwordHash: users.passwordHash,
        emailVerifiedAt: users.emailVerifiedAt,
        displayName: users.displayName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, userId));
    expect(account).toMatchObject(profileBefore);
    expect(account?.passwordHash).not.toBe(oldPassword);
    expect(account?.passwordHash).not.toBe(newPassword);
    expect(account?.emailVerifiedAt?.getTime()).toBe(emailVerifiedAt.getTime());

    const roles = await getDatabaseClient()
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    expect(roles).toEqual([{ role: 'student' }]);

    await expect(
      loginAccount({ email: await getEmail(userId), password: oldPassword }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
      statusCode: 401,
    });
    await expect(
      loginAccount({ email: await getEmail(userId), password: newPassword }),
    ).resolves.toMatchObject({ response: { success: true } });
  });

  it('rejects wrong current credentials without changing the password or sessions', async () => {
    const userId = await createTestUser('correct current password');
    await createTestSession(userId);
    const [before] = await getDatabaseClient()
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId));

    await expect(
      changePassword(userId, {
        currentPassword: 'incorrect current password',
        newPassword: 'new integration password',
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.UNAUTHORIZED, statusCode: 401 });

    const [after] = await getDatabaseClient()
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId));
    const [session] = await getDatabaseClient()
      .select({ revokedAt: sessions.revokedAt })
      .from(sessions)
      .where(eq(sessions.userId, userId));
    expect(after?.passwordHash).toBe(before?.passwordHash);
    expect(session?.revokedAt).toBeNull();
  });

  it('allows only one of two simultaneous changes using the same current password', async () => {
    const userId = await createTestUser('shared current password');
    const results = await Promise.allSettled([
      changePassword(userId, {
        currentPassword: 'shared current password',
        newPassword: 'first replacement password',
      }),
      changePassword(userId, {
        currentPassword: 'shared current password',
        newPassword: 'second replacement password',
      }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const [account] = await getDatabaseClient()
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId));
    const firstWorks = await import('../../../infrastructure/security/password-hasher.js').then(
      ({ verifyPassword }) => verifyPassword('first replacement password', account!.passwordHash),
    );
    const secondWorks = await import('../../../infrastructure/security/password-hasher.js').then(
      ({ verifyPassword }) => verifyPassword('second replacement password', account!.passwordHash),
    );
    expect(Number(firstWorks) + Number(secondWorks)).toBe(1);
  });
});

async function getEmail(userId: Uuid): Promise<string> {
  const [account] = await getDatabaseClient()
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  if (!account) throw new Error('Integration account was not found.');
  return account.email;
}
