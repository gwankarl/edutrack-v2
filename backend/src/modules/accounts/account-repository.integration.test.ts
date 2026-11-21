import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { parseEnvironment } from '../../infrastructure/config/environment.js';
import {
  closeDatabaseConnection,
  initializeDatabaseConnection,
} from '../../infrastructure/database/connection.js';
import { createDatabaseClient } from '../../infrastructure/database/client.js';
import { users } from '../../infrastructure/database/schema/accounts/users.table.js';
import {
  createAccount,
  findAccountById,
  findAccountForAuthenticationByEmail,
} from './account-repository.js';
import { AccountEmailAlreadyExistsError } from './account-repository.errors.js';

const TEST_DATABASE_NAME = 'edutrack_test';
const createdAccountIds: string[] = [];

let pool: Pool | undefined;

function requirePool(): Pool {
  if (!pool) {
    throw new Error('Accounts repository test pool was not initialized.');
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
      'Refusing Accounts repository tests: DATABASE_TEST_URL must target a separate local edutrack_test database.',
    );
  }
}

function uniqueEmail(): string {
  return `repository-${randomUUID()}@example.test`;
}

async function rememberAccount(email = uniqueEmail()): Promise<string> {
  const account = await createAccount({
    displayName: 'Repository Integration User',
    email,
    passwordHash: 'test-only-hash',
  });

  createdAccountIds.push(account.id);
  return account.id;
}

beforeAll(async () => {
  const testUrl = requireTestDatabaseUrl();
  const environment = parseEnvironment({
    ...process.env,
    DATABASE_URL: testUrl.toString(),
  });

  pool = initializeDatabaseConnection(environment);

  // Confirm the connected server database before repository tests write records.
  const identity = await requirePool().query<{ database_name: string }>(
    'SELECT current_database() AS database_name',
  );

  if (identity.rows[0]?.database_name !== TEST_DATABASE_NAME) {
    throw new Error('Refusing Accounts repository tests: PostgreSQL did not report edutrack_test.');
  }

  createDatabaseClient(requirePool());
});

afterEach(async () => {
  if (createdAccountIds.length > 0) {
    const ids = [...createdAccountIds];
    await createDatabaseClient(requirePool()).delete(users).where(inArray(users.id, ids));
    createdAccountIds.splice(0, ids.length);
  }
});

afterAll(async () => {
  try {
    if (pool && createdAccountIds.length > 0) {
      await createDatabaseClient(pool)
        .delete(users)
        .where(inArray(users.id, [...createdAccountIds]));
      createdAccountIds.length = 0;
    }
  } finally {
    await closeDatabaseConnection();
    pool = undefined;
  }
});

describe('Accounts repository', () => {
  it('creates an account with normalized email and returns no password hash', async () => {
    const account = await createAccount({
      displayName: 'Repository User',
      email: '  Student@Example.test ',
      passwordHash: 'test-only-hash',
    });

    createdAccountIds.push(account.id);

    expect(account).toMatchObject({
      displayName: 'Repository User',
      email: 'student@example.test',
    });
    expect(account).not.toHaveProperty('passwordHash');
  });

  it('retrieves authentication fields by normalized email', async () => {
    const id = await rememberAccount('Student@Example.test');

    const account = await findAccountForAuthenticationByEmail('  STUDENT@example.test ');

    expect(account).toMatchObject({
      id,
      email: 'student@example.test',
      passwordHash: 'test-only-hash',
    });
  });

  it('retrieves a safe account record by UUID', async () => {
    const id = await rememberAccount();

    const account = await findAccountById(id);

    expect(account).toMatchObject({
      id,
      displayName: 'Repository Integration User',
    });
    expect(account).not.toHaveProperty('passwordHash');
  });

  it('returns undefined when an account is not found', async () => {
    await expect(findAccountById(randomUUID())).resolves.toBeUndefined();
    await expect(findAccountForAuthenticationByEmail(uniqueEmail())).resolves.toBeUndefined();
  });

  it('distinguishes a duplicate normalized email from other database failures', async () => {
    const email = uniqueEmail();
    await rememberAccount(email);

    await expect(
      createAccount({
        displayName: 'Duplicate User',
        email: email.toUpperCase(),
        passwordHash: 'test-only-hash',
      }),
    ).rejects.toBeInstanceOf(AccountEmailAlreadyExistsError);
  });

  it('does not translate a different persistence error into an email conflict', async () => {
    await expect(
      createAccount({
        displayName: null as unknown as string,
        email: uniqueEmail(),
        passwordHash: 'test-only-hash',
      }),
    ).rejects.not.toBeInstanceOf(AccountEmailAlreadyExistsError);
  });
});
