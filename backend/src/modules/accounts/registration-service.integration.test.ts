import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RegistrationRequest, RegistrationResponse } from '@edutrack/contracts';
import { getDatabaseClient, createDatabaseClient } from '../../infrastructure/database/client.js';
import { parseEnvironment } from '../../infrastructure/config/environment.js';
import {
  closeDatabaseConnection,
  initializeDatabaseConnection,
} from '../../infrastructure/database/connection.js';
import { userRoles } from '../../infrastructure/database/schema/accounts/user-roles.table.js';
import { users } from '../../infrastructure/database/schema/accounts/users.table.js';
import { ERROR_CODES } from '../../infrastructure/errors/error-codes.js';
import { verifyPassword } from '../../infrastructure/security/password-hasher.js';
import * as accountRepository from './account-repository.js';
import { findAccountForAuthenticationByEmail } from './account-repository.js';
import { registerStudent } from './registration-service.js';

vi.mock('./account-repository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./account-repository.js')>();

  return {
    ...actual,
    assignStudentRole: vi.fn(actual.assignStudentRole),
  };
});

const TEST_DATABASE_NAME = 'edutrack_test';
const testEmails: string[] = [];

let pool: Pool | undefined;

const testVerificationDelivery = {
  assertDeliveryAvailable() {},
  async sendForAccount() {},
};

function requirePool(): Pool {
  if (!pool) {
    throw new Error('Registration integration test pool was not initialized.');
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
      'Refusing registration integration tests: DATABASE_TEST_URL must target a separate local edutrack_test database.',
    );
  }
}

function makeRegistration(
  email = `registration-${randomUUID()}@example.test`,
): RegistrationRequest {
  testEmails.push(email.trim().toLowerCase());

  return {
    displayName: '  Integration Student  ',
    email,
    password: 'a sufficiently long test passphrase',
  };
}

beforeAll(async () => {
  const testUrl = requireTestDatabaseUrl();
  const environment = parseEnvironment({
    ...process.env,
    DATABASE_URL: testUrl.toString(),
  });

  pool = initializeDatabaseConnection(environment);

  // Confirm the server-reported target before any test writes.
  const identity = await requirePool().query<{ database_name: string }>(
    'SELECT current_database() AS database_name',
  );

  if (identity.rows[0]?.database_name !== TEST_DATABASE_NAME) {
    throw new Error(
      'Refusing registration integration tests: PostgreSQL did not report edutrack_test.',
    );
  }

  createDatabaseClient(requirePool());
});

afterEach(async () => {
  if (testEmails.length > 0) {
    const emails = [...new Set(testEmails)];
    await getDatabaseClient().delete(users).where(inArray(users.email, emails));
    testEmails.splice(0, testEmails.length);
  }
});

afterAll(async () => {
  try {
    if (pool && testEmails.length > 0) {
      await getDatabaseClient()
        .delete(users)
        .where(inArray(users.email, [...new Set(testEmails)]));
      testEmails.splice(0, testEmails.length);
    }
  } finally {
    await closeDatabaseConnection();
    pool = undefined;
  }
});

describe('Student registration service', () => {
  it('hashes the password, assigns only Student, and returns safe response data', async () => {
    const input = makeRegistration();
    const response = await registerStudent(input, testVerificationDelivery);

    expect(response).toMatchObject({
      success: true,
      data: {
        displayName: 'Integration Student',
        email: input.email.toLowerCase(),
      },
    });
    expect(response.data).not.toHaveProperty('passwordHash');
    expect(response.data).not.toHaveProperty('role');

    const storedAccount = await findAccountForAuthenticationByEmail(input.email);

    expect(storedAccount).toBeDefined();
    expect(storedAccount?.passwordHash).not.toBe(input.password);
    await expect(verifyPassword(input.password, storedAccount!.passwordHash)).resolves.toBe(true);

    const roles = await getDatabaseClient()
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, response.data.id));

    expect(roles).toEqual([{ role: 'student' }]);
  });

  it('maps a duplicate email to the standard conflict application error', async () => {
    const input = makeRegistration();
    await registerStudent(input, testVerificationDelivery);

    await expect(registerStudent(input, testVerificationDelivery)).rejects.toMatchObject({
      name: 'AppError',
      code: ERROR_CODES.CONFLICT,
      statusCode: 409,
      message: 'An account with this email already exists.',
    });
  });

  it('allows the database unique index to resolve concurrent duplicate registrations', async () => {
    const first = makeRegistration();
    const second = { ...first };

    const results = await Promise.allSettled([
      registerStudent(first, testVerificationDelivery),
      registerStudent(second, testVerificationDelivery),
    ]);

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<RegistrationResponse> =>
        result.status === 'fulfilled',
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({
      code: ERROR_CODES.CONFLICT,
      statusCode: 409,
    });

    const account = await findAccountForAuthenticationByEmail(first.email);
    expect(account).toBeDefined();
  });

  it.each(['teacher', 'administrator'] as const)(
    'rejects public registration input that attempts to select the %s role',
    async (role) => {
      const input = makeRegistration();
      const inputWithRole = { ...input, role } as RegistrationRequest;

      await expect(registerStudent(inputWithRole, testVerificationDelivery)).rejects.toHaveProperty(
        'name',
        'ZodError',
      );
      await expect(findAccountForAuthenticationByEmail(input.email)).resolves.toBeUndefined();
    },
  );

  it('rolls back user creation when Student role assignment fails', async () => {
    const input = makeRegistration();

    vi.mocked(accountRepository.assignStudentRole).mockRejectedValueOnce(
      new Error('Synthetic role assignment failure.'),
    );

    await expect(registerStudent(input, testVerificationDelivery)).rejects.toThrow(
      'Synthetic role assignment failure.',
    );
    await expect(findAccountForAuthenticationByEmail(input.email)).resolves.toBeUndefined();
  });
});
