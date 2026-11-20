import { Pool } from 'pg';
import type { BackendEnvironment } from '../config/environment.js';

let databasePool: Pool | undefined;

export function initializeDatabaseConnection(
  environment: Pick<BackendEnvironment, 'DATABASE_URL'>,
): Pool {
  if (databasePool) {
    return databasePool;
  }

  databasePool = new Pool({
    connectionString: environment.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: 'edutrack-api',
  });

  return databasePool;
}

export function getDatabasePool(): Pool {
  if (!databasePool) {
    throw new Error('Database connection has not been initialized.');
  }

  return databasePool;
}

export async function closeDatabaseConnection(): Promise<void> {
  const pool = databasePool;
  databasePool = undefined;

  if (pool) {
    await pool.end();
  }
}
