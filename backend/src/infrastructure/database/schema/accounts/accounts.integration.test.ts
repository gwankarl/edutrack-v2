import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as schema from './index.js';
import {
  emailVerificationTokens,
  passwordResetTokens,
  sessions,
  userRoles,
  users,
} from './index.js';

const TEST_DATABASE_NAME = 'edutrack_test';
const createdUserIds: string[] = [];

type AccountsDatabase = NodePgDatabase<typeof schema>;

let pool: Pool | undefined;
let database: AccountsDatabase | undefined;

function requireDatabase(): AccountsDatabase {
  if (!database) {
    throw new Error('Accounts integration database was not initialized.');
  }

  return database;
}

function requirePool(): Pool {
  if (!pool) {
    throw new Error('Accounts integration database pool was not initialized.');
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
      throw new Error('Invalid integration database target.');
    }

    const applicationUrl = process.env.DATABASE_URL;

    if (applicationUrl) {
      const application = new URL(applicationUrl);
      const applicationHostname = application.hostname.toLowerCase().replace(/^\[|\]$/g, '');
      const target = `${hostname}:${url.port || '5432'}/${databaseName}`;
      const applicationTarget = `${applicationHostname}:${application.port || '5432'}/${decodeURIComponent(application.pathname.replace(/^\/+/, ''))}`;

      if (applicationTarget === target) {
        throw new Error('Test and application database targets are identical.');
      }
    }

    return url;
  } catch {
    throw new Error(
      'Refusing Accounts integration tests: DATABASE_TEST_URL must target a separate local PostgreSQL edutrack_test database.',
    );
  }
}

async function createUser(email = `accounts-${randomUUID()}@example.test`) {
  const [user] = await requireDatabase()
    .insert(users)
    .values({ displayName: 'Integration Test User', email, passwordHash: 'test-only-hash' })
    .returning();

  if (!user) {
    throw new Error('Failed to create an Accounts integration user.');
  }

  createdUserIds.push(user.id);
  return user;
}

function tokenHash(): string {
  return createHash('sha256').update(randomBytes(32)).digest('hex');
}

beforeAll(async () => {
  const testUrl = requireTestDatabaseUrl();
  pool = new Pool({
    connectionString: testUrl.toString(),
    max: 3,
    connectionTimeoutMillis: 5_000,
    application_name: 'edutrack-accounts-integration-tests',
  });

  // Verify the server-reported database before any test can write synthetic records.
  const identity = await pool.query<{ database_name: string }>(
    'SELECT current_database() AS database_name',
  );

  if (identity.rows[0]?.database_name !== TEST_DATABASE_NAME) {
    throw new Error(
      'Refusing Accounts integration tests: PostgreSQL did not report edutrack_test.',
    );
  }

  database = drizzle({ client: pool, schema });
});

afterEach(async () => {
  if (database && createdUserIds.length > 0) {
    const ids = [...createdUserIds];
    await database.delete(users).where(inArray(users.id, ids));
    createdUserIds.splice(0, ids.length);
  }
});

afterAll(async () => {
  try {
    if (database && createdUserIds.length > 0) {
      await database.delete(users).where(inArray(users.id, [...createdUserIds]));
      createdUserIds.length = 0;
    }
  } finally {
    database = undefined;

    if (pool) {
      await pool.end();
      pool = undefined;
    }
  }
});

describe('Accounts PostgreSQL schemas', () => {
  it('creates users and enforces case-insensitive unique email addresses', async () => {
    const user = await createUser('Student@Example.test');

    expect(user.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);

    await expect(createUser('student@example.test')).rejects.toBeDefined();
  });

  it('allows multiple roles for one user and rejects duplicate or invalid assignments', async () => {
    const user = await createUser();
    const db = requireDatabase();

    await db.insert(userRoles).values([
      { userId: user.id, role: 'student' },
      { userId: user.id, role: 'teacher' },
    ]);

    await expect(
      db.insert(userRoles).values({ userId: user.id, role: 'student' }),
    ).rejects.toBeDefined();
    await expect(
      db.insert(userRoles).values({ userId: randomUUID(), role: 'student' }),
    ).rejects.toBeDefined();
    await expect(
      db.insert(userRoles).values({ userId: user.id, role: 'observer' as 'student' }),
    ).rejects.toBeDefined();

    const assignments = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      with: { roleAssignments: true },
    });

    expect(assignments?.roleAssignments.map(({ role }) => role).sort()).toEqual([
      'student',
      'teacher',
    ]);
  });

  it('allows multiple sessions and enforces hashed-token uniqueness and expiry fields', async () => {
    const user = await createUser();
    const db = requireDatabase();
    const firstHash = tokenHash();
    const expiresAt = new Date(Date.now() + 60_000);

    await db.insert(sessions).values([
      { userId: user.id, tokenHash: firstHash, expiresAt },
      { userId: user.id, tokenHash: tokenHash(), expiresAt },
    ]);
    await expect(
      db.insert(sessions).values({ userId: user.id, tokenHash: firstHash, expiresAt }),
    ).rejects.toBeDefined();

    const stored = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      with: { sessions: true },
    });

    expect(stored?.sessions).toHaveLength(2);
    expect(stored?.sessions[0]?.expiresAt).toBeInstanceOf(Date);
    expect(stored?.sessions.every((session) => session.expiresAt > session.createdAt)).toBe(true);

    await expect(
      db.insert(sessions).values({
        userId: user.id,
        tokenHash: 'plaintext-session-token',
        expiresAt,
      }),
    ).rejects.toBeDefined();
    await expect(
      db.insert(sessions).values({
        userId: user.id,
        tokenHash: tokenHash(),
        expiresAt: new Date(0),
      }),
    ).rejects.toBeDefined();
  });

  it('enforces unique hashes and stores lifecycle timestamps for both account token types', async () => {
    const user = await createUser();
    const db = requireDatabase();
    const verificationHash = tokenHash();
    const resetHash = tokenHash();
    const expiresAt = new Date(Date.now() + 60_000);

    await db.insert(emailVerificationTokens).values({
      userId: user.id,
      tokenHash: verificationHash,
      expiresAt,
    });
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: resetHash,
      expiresAt,
    });

    await expect(
      db.insert(emailVerificationTokens).values({
        userId: user.id,
        tokenHash: verificationHash,
        expiresAt,
      }),
    ).rejects.toBeDefined();
    await expect(
      db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash: resetHash,
        expiresAt,
      }),
    ).rejects.toBeDefined();

    await expect(
      db.insert(emailVerificationTokens).values({
        userId: user.id,
        tokenHash: 'plaintext-verification-token',
        expiresAt,
      }),
    ).rejects.toBeDefined();
    await expect(
      db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash: 'plaintext-password-reset-token',
        expiresAt,
      }),
    ).rejects.toBeDefined();
    await expect(
      db.insert(emailVerificationTokens).values({
        userId: user.id,
        tokenHash: tokenHash(),
        expiresAt: new Date(0),
      }),
    ).rejects.toBeDefined();
    await expect(
      db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash: tokenHash(),
        expiresAt: new Date(0),
      }),
    ).rejects.toBeDefined();

    const consumedAt = new Date();
    await db
      .update(emailVerificationTokens)
      .set({ consumedAt })
      .where(eq(emailVerificationTokens.userId, user.id));
    await db
      .update(passwordResetTokens)
      .set({ consumedAt })
      .where(eq(passwordResetTokens.userId, user.id));

    const stored = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      with: { emailVerificationTokens: true, passwordResetTokens: true },
    });

    expect(stored?.emailVerificationTokens[0]?.createdAt).toBeInstanceOf(Date);
    expect(stored?.emailVerificationTokens[0]?.expiresAt).toBeInstanceOf(Date);
    expect(stored?.emailVerificationTokens[0]?.consumedAt).toEqual(consumedAt);
    expect(stored?.passwordResetTokens[0]?.createdAt).toBeInstanceOf(Date);
    expect(stored?.passwordResetTokens[0]?.expiresAt).toBeInstanceOf(Date);
    expect(stored?.passwordResetTokens[0]?.consumedAt).toEqual(consumedAt);
  });

  it('has the expected account migration indexes', async () => {
    const result = await requirePool().query<{ indexname: string }>(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = ANY($1::text[])`,
      [['users', 'user_roles', 'sessions', 'email_verification_tokens', 'password_reset_tokens']],
    );

    expect(result.rows.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        'users_pkey',
        'users_email_lower_unique',
        'user_roles_pk',
        'user_roles_role_idx',
        'sessions_pkey',
        'sessions_token_hash_unique',
        'sessions_expires_at_idx',
        'sessions_user_created_at_idx',
        'email_verification_tokens_pkey',
        'email_verification_tokens_token_hash_unique',
        'email_verification_tokens_expires_at_idx',
        'email_verification_tokens_user_created_at_idx',
        'email_verification_tokens_user_unconsumed_idx',
        'password_reset_tokens_pkey',
        'password_reset_tokens_token_hash_unique',
        'password_reset_tokens_expires_at_idx',
        'password_reset_tokens_user_unconsumed_idx',
      ]),
    );
  });

  it('applies user deletion cascades and nulls deleted role assigners', async () => {
    const db = requireDatabase();
    const user = await createUser();
    const assigner = await createUser();
    const expiresAt = new Date(Date.now() + 60_000);

    await db.insert(userRoles).values({
      userId: user.id,
      role: 'teacher',
      assignedByUserId: assigner.id,
    });
    await db.insert(sessions).values({ userId: user.id, tokenHash: tokenHash(), expiresAt });
    await db.insert(emailVerificationTokens).values({
      userId: user.id,
      tokenHash: tokenHash(),
      expiresAt,
    });
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: tokenHash(),
      expiresAt,
    });

    const assignmentsByActor = await db.query.users.findFirst({
      where: eq(users.id, assigner.id),
      with: { roleAssignmentsCreated: true },
    });
    expect(assignmentsByActor?.roleAssignmentsCreated).toHaveLength(1);

    await db.delete(users).where(eq(users.id, assigner.id));
    const assignment = await db.query.userRoles.findFirst({ where: eq(userRoles.userId, user.id) });
    expect(assignment?.assignedByUserId).toBeNull();

    await db.delete(users).where(eq(users.id, user.id));
    expect(
      await db.query.userRoles.findMany({ where: eq(userRoles.userId, user.id) }),
    ).toHaveLength(0);
    expect(await db.query.sessions.findMany({ where: eq(sessions.userId, user.id) })).toHaveLength(
      0,
    );
    expect(
      await db.query.emailVerificationTokens.findMany({
        where: eq(emailVerificationTokens.userId, user.id),
      }),
    ).toHaveLength(0);
    expect(
      await db.query.passwordResetTokens.findMany({
        where: eq(passwordResetTokens.userId, user.id),
      }),
    ).toHaveLength(0);
  });
});
