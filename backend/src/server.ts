import { createApp } from './app/create-app.js';
import { parseEnvironment } from './infrastructure/config/environment.js';
import { createDatabaseClient } from './infrastructure/database/client.js';
import {
  closeDatabaseConnection,
  initializeDatabaseConnection,
} from './infrastructure/database/connection.js';

let app: ReturnType<typeof createApp> | undefined;
let shutdownPromise: Promise<void> | undefined;

async function closeResources(): Promise<void> {
  try {
    if (app) {
      await app.close();
    }
  } finally {
    await closeDatabaseConnection();
  }
}

function requestShutdown(signal: NodeJS.Signals): void {
  app?.log.info({ signal }, 'EduTrack API shutting down');

  shutdownPromise ??= closeResources();

  void shutdownPromise.catch((error: unknown) => {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    app?.log.error({ errorName }, 'EduTrack API shutdown failed');
    process.exitCode = 1;
  });
}

process.once('SIGINT', () => requestShutdown('SIGINT'));
process.once('SIGTERM', () => requestShutdown('SIGTERM'));

try {
  const environment = parseEnvironment();

  app = createApp(environment);

  const pool = initializeDatabaseConnection(environment);

  // Do not log the pg error object: its message may include connection details.
  pool.on('error', (error) => {
    app?.log.error({ errorName: error.name }, 'PostgreSQL pool client error');
  });

  createDatabaseClient(pool);

  app.addHook('onClose', closeDatabaseConnection);

  const address = await app.listen({
    host: environment.HOST,
    port: environment.PORT,
  });

  app.log.info({ address }, 'EduTrack API listening');
} catch (error) {
  try {
    await closeResources();
  } catch {
    // Preserve the original startup failure; shutdown logging omits error details.
  }

  const message = error instanceof Error ? error.message : 'Unknown startup failure';
  console.error(`EduTrack API startup failed: ${message}`);
  process.exitCode = 1;
}
