import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseEnvironment } from '../config/environment.js';
import { createDatabaseClient } from './client.js';
import {
  closeDatabaseConnection,
  getDatabasePool,
  initializeDatabaseConnection,
} from './connection.js';
import { checkDatabaseConnection } from './health.js';

const TEST_DATABASE_NAME = 'edutrack_test';

let integrationDatabaseUrl: URL | undefined;
let integrationPool: Pool | undefined;
let integrationClient: NodePgDatabase | undefined;

function databaseIdentity(url: URL): string {
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  const port = url.port || '5432';

  return `${url.hostname.toLowerCase()}:${port}/${databaseName}`;
}

function requireTestDatabaseUrl(): URL {
  const configuredUrl = process.env.DATABASE_TEST_URL;

  if (!configuredUrl) {
    throw new Error('Set DATABASE_TEST_URL to the dedicated edutrack_test database.');
  }

  try {
    const testUrl = new URL(configuredUrl);
    const isPostgres = /^postgres(?:ql)?:$/i.test(testUrl.protocol);
    const databaseName = decodeURIComponent(testUrl.pathname.replace(/^\/+/, ''));

    const hostname = testUrl.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const isLoopbackHost = ['localhost', '127.0.0.1', '::1'].includes(hostname);

    if (!isPostgres || databaseName !== TEST_DATABASE_NAME || !isLoopbackHost) {
      throw new Error('Invalid test database target.');
    }

    const applicationUrl = process.env.DATABASE_URL;

    if (applicationUrl) {
      const applicationDatabaseUrl = new URL(applicationUrl);

      if (databaseIdentity(applicationDatabaseUrl) === databaseIdentity(testUrl)) {
        throw new Error('Test and application database targets are identical.');
      }
    }

    return testUrl;
  } catch {
    throw new Error(
      'Refusing to run database integration tests: DATABASE_TEST_URL must target a separate PostgreSQL edutrack_test database.',
    );
  }
}

function requireIntegrationPool(): Pool {
  if (!integrationPool) {
    throw new Error('Integration database pool was not initialized.');
  }

  return integrationPool;
}

function requireIntegrationClient(): NodePgDatabase {
  if (!integrationClient) {
    throw new Error('Integration Drizzle client was not initialized.');
  }

  return integrationClient;
}

function requireIntegrationUrl(): URL {
  if (!integrationDatabaseUrl) {
    throw new Error('Integration database URL was not initialized.');
  }

  return integrationDatabaseUrl;
}

beforeAll(async () => {
  integrationDatabaseUrl = requireTestDatabaseUrl();

  const environment = parseEnvironment({
    ...process.env,
    DATABASE_URL: integrationDatabaseUrl.toString(),
  });

  integrationPool = initializeDatabaseConnection(environment);

  const identity = await integrationPool.query<{ database_name: string }>(
    'SELECT current_database() AS database_name',
  );

  if (identity.rows[0]?.database_name !== TEST_DATABASE_NAME) {
    throw new Error(
      'Refusing to run database integration tests: PostgreSQL did not report edutrack_test.',
    );
  }

  integrationPool.on('error', () => {
    // Query failures are asserted by the test; never print driver details.
  });

  integrationClient = createDatabaseClient(integrationPool);
});

afterAll(async () => {
  await closeDatabaseConnection();
});

describe('PostgreSQL integration', () => {
  it('reuses the initialized test pool and Drizzle client', () => {
    const pool = requireIntegrationPool();

    const environment = parseEnvironment({
      ...process.env,
      DATABASE_URL: requireIntegrationUrl().toString(),
    });

    expect(initializeDatabaseConnection(environment)).toBe(pool);
    expect(getDatabasePool()).toBe(pool);
    expect(createDatabaseClient(pool)).toBe(requireIntegrationClient());
  });

  it('runs SELECT 1 through the PostgreSQL pool', async () => {
    const result = await requireIntegrationPool().query<{ connected: number }>(
      'SELECT 1 AS connected',
    );

    expect(result.rows[0]?.connected).toBe(1);
  });

  it('runs SELECT 1 through the Drizzle health check', async () => {
    await expect(checkDatabaseConnection()).resolves.toBeUndefined();
  });

  it('returns a safe failure for an unreachable test database', async () => {
    const unreachableUrl = new URL(requireIntegrationUrl());
    unreachableUrl.hostname = '127.0.0.1';
    unreachableUrl.port = '1';

    const failingPool = new Pool({
      connectionString: unreachableUrl.toString(),
      connectionTimeoutMillis: 500,
    });

    try {
      const failingClient = drizzle({ client: failingPool });

      await expect(checkDatabaseConnection(failingClient)).rejects.toMatchObject({
        name: 'DatabaseHealthCheckError',
        message: 'PostgreSQL connectivity check failed.',
      });
    } finally {
      await failingPool.end();
    }
  });

  it('closes the shared pool cleanly', async () => {
    const pool = requireIntegrationPool();

    await closeDatabaseConnection();

    expect(() => getDatabasePool()).toThrow('Database connection has not been initialized.');
    expect(pool.totalCount).toBe(0);

    integrationPool = undefined;
    integrationClient = undefined;
  });
});
