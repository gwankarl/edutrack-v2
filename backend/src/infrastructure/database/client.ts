import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { getDatabasePool } from './connection.js';

const clientsByPool = new WeakMap<Pool, NodePgDatabase>();

export function createDatabaseClient(pool: Pool): NodePgDatabase {
  const existingClient = clientsByPool.get(pool);

  if (existingClient) {
    return existingClient;
  }

  const client = drizzle({ client: pool });
  clientsByPool.set(pool, client);

  return client;
}

export function getDatabaseClient(): NodePgDatabase {
  return createDatabaseClient(getDatabasePool());
}
