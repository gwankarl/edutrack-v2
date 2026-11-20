import { afterEach, describe, expect, it } from 'vitest';
import { parseEnvironment } from '../config/environment.js';
import { createDatabaseClient, getDatabaseClient } from './client.js';
import { closeDatabaseConnection, initializeDatabaseConnection } from './connection.js';

const environment = parseEnvironment({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/edutrack_test',
});

afterEach(async () => {
  await closeDatabaseConnection();
});

describe('database infrastructure lifecycle', () => {
  it('reuses one lazy pool and Drizzle client without connecting to PostgreSQL', () => {
    const pool = initializeDatabaseConnection(environment);

    expect(initializeDatabaseConnection(environment)).toBe(pool);
    expect(pool.totalCount).toBe(0);

    const client = createDatabaseClient(pool);

    expect(createDatabaseClient(pool)).toBe(client);
    expect(getDatabaseClient()).toBe(client);
  });

  it('closes the pool and allows a later explicit initialization', async () => {
    const firstPool = initializeDatabaseConnection(environment);

    await closeDatabaseConnection();

    const nextPool = initializeDatabaseConnection(environment);

    expect(nextPool).not.toBe(firstPool);
  });
});
