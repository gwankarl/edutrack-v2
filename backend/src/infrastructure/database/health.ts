import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getDatabaseClient } from './client.js';

export class DatabaseHealthCheckError extends Error {
  constructor() {
    super('PostgreSQL connectivity check failed.');
    this.name = 'DatabaseHealthCheckError';
  }
}

export async function checkDatabaseConnection(
  database: NodePgDatabase = getDatabaseClient(),
): Promise<void> {
  try {
    await database.transaction(
      async (transaction) => {
        await transaction.execute(sql`SET LOCAL statement_timeout = '5000ms'`);
        await transaction.execute(sql`SELECT 1`);
      },
      { accessMode: 'read only' },
    );
  } catch {
    // Keep driver messages and connection details out of the error exposed to callers.
    throw new DatabaseHealthCheckError();
  }
}
