import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabaseClient,
  getDatabaseClient,
} from '../../../infrastructure/database/client.js';
import {
  closeDatabaseConnection,
  initializeDatabaseConnection,
} from '../../../infrastructure/database/connection.js';
import { userRoles } from '../../../infrastructure/database/schema/accounts/user-roles.table.js';
import { users } from '../../../infrastructure/database/schema/accounts/users.table.js';
import { updateProfile } from './profile-repository.js';

const TEST_DATABASE_NAME = 'edutrack_test';
const createdUserIds: string[] = [];

let pool: Pool | undefined;

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
      'Refusing profile repository tests: DATABASE_TEST_URL must target a separate local edutrack_test database.',
    );
  }
}

async function createTestUser(options: {
  displayName: string;
  emailVerifiedAt?: Date;
  updatedAt: Date;
}): Promise<string> {
  const values: typeof users.$inferInsert = {
    displayName: options.displayName,
    email: `profile-${randomUUID()}@example.test`,
    passwordHash: 'test-only-placeholder-hash',
    updatedAt: options.updatedAt,
  };

  if (options.emailVerifiedAt) {
    values.emailVerifiedAt = options.emailVerifiedAt;
  }

  const [user] = await getDatabaseClient().insert(users).values(values).returning({ id: users.id });

  if (!user) {
    throw new Error('Failed to create a profile integration test user.');
  }

  createdUserIds.push(user.id);
  return user.id;
}

beforeAll(async () => {
  const testUrl = requireTestDatabaseUrl();
  pool = new Pool({ connectionString: testUrl.toString(), max: 1 });

  const identity = await pool.query('SELECT current_database() AS database_name');
  if (identity.rows[0]?.database_name !== TEST_DATABASE_NAME) {
    throw new Error('Refusing profile repository tests: connected database is not edutrack_test.');
  }

  initializeDatabaseConnection({ DATABASE_URL: testUrl.toString() });
});

afterEach(async () => {
  if (createdUserIds.length > 0) {
    const ids = [...createdUserIds];
    await getDatabaseClient().delete(users).where(inArray(users.id, ids));
    createdUserIds.length = 0;
  }
});

afterAll(async () => {
  try {
    if (createdUserIds.length > 0) {
      await createDatabaseClient(pool!)
        .delete(users)
        .where(inArray(users.id, [...createdUserIds]));
      createdUserIds.length = 0;
    }
  } finally {
    await closeDatabaseConnection();
    await pool?.end();
    pool = undefined;
  }
});

describe('profile repository', () => {
  it('updates only the target user display name and timestamp, preserving protected data', async () => {
    const oldTimestamp = new Date('2000-01-01T00:00:00.000Z');
    const verifiedAt = new Date('2020-01-02T03:04:05.000Z');
    const targetId = await createTestUser({
      displayName: 'Before Update',
      emailVerifiedAt: verifiedAt,
      updatedAt: oldTimestamp,
    });
    const otherId = await createTestUser({
      displayName: 'Other Account',
      updatedAt: oldTimestamp,
    });

    await getDatabaseClient()
      .insert(userRoles)
      .values([
        { userId: targetId, role: 'student' },
        { userId: targetId, role: 'teacher' },
        { userId: otherId, role: 'student' },
      ]);

    const result = await updateProfile(targetId, { displayName: 'Updated Name' });

    expect(result).toEqual({
      id: targetId,
      displayName: 'Updated Name',
      email: expect.stringMatching(/^profile-/),
    });
    expect(Object.keys(result ?? {}).sort()).toEqual(['displayName', 'email', 'id']);

    const [updatedTarget] = await getDatabaseClient()
      .select({
        displayName: users.displayName,
        email: users.email,
        passwordHash: users.passwordHash,
        emailVerifiedAt: users.emailVerifiedAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, targetId));

    expect(updatedTarget?.displayName).toBe('Updated Name');
    expect(updatedTarget?.email).toMatch(/^profile-/);
    expect(updatedTarget?.passwordHash).toBe('test-only-placeholder-hash');
    expect(updatedTarget?.emailVerifiedAt).toEqual(verifiedAt);
    expect(updatedTarget?.createdAt).toBeInstanceOf(Date);
    expect(updatedTarget?.updatedAt.getTime()).toBeGreaterThan(oldTimestamp.getTime());

    const roles = await getDatabaseClient()
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, targetId));

    expect(roles.map(({ role }) => role).sort()).toEqual(['student', 'teacher']);

    const [otherUser] = await getDatabaseClient()
      .select({
        displayName: users.displayName,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, otherId));

    expect(otherUser).toEqual({
      displayName: 'Other Account',
      updatedAt: oldTimestamp,
    });
  });

  it('returns undefined for a nonexistent user', async () => {
    await expect(
      updateProfile(randomUUID(), { displayName: 'No Such User' }),
    ).resolves.toBeUndefined();
  });

  it('leaves the profile unchanged when PostgreSQL rejects the update', async () => {
    const oldTimestamp = new Date('2000-01-01T00:00:00.000Z');
    const targetId = await createTestUser({
      displayName: 'Before Update',
      updatedAt: oldTimestamp,
    });

    await expect(
      updateProfile(targetId, {
        displayName: null as unknown as string,
      }),
    ).rejects.toThrow();

    const [stored] = await getDatabaseClient()
      .select({
        displayName: users.displayName,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, targetId));

    expect(stored).toEqual({
      displayName: 'Before Update',
      updatedAt: oldTimestamp,
    });
  });
});
