import { parseEnvironment } from '../config/environment.js';
import { createDatabaseClient } from './client.js';
import { checkDatabaseConnection } from './health.js';
import { closeDatabaseConnection, initializeDatabaseConnection } from './connection.js';

async function main(): Promise<void> {
  try {
    const environment = parseEnvironment();
    const pool = initializeDatabaseConnection(environment);

    pool.on('error', () => {
      console.error('PostgreSQL reported an idle connection error.');
    });

    createDatabaseClient(pool);
    await checkDatabaseConnection();

    console.info('PostgreSQL connectivity check passed.');
  } catch {
    console.error(
      'PostgreSQL connectivity check failed. Check DATABASE_URL and PostgreSQL availability.',
    );
    process.exitCode = 1;
  } finally {
    try {
      await closeDatabaseConnection();
    } catch {
      console.error('PostgreSQL connection cleanup failed.');
      process.exitCode = 1;
    }
  }
}

await main();
