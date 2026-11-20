import { createApp } from './app/create-app.js';
import { parseEnvironment } from './infrastructure/config/environment.js';

try {
  const environment = parseEnvironment();

  const app = createApp(environment);

  const address = await app.listen({
    host: environment.HOST,
    port: environment.PORT,
  });

  app.log.info({ address }, 'EduTrack API listening');
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown startup failure';
  console.error(`EduTrack API startup failed: ${message}`);
  process.exitCode = 1;
}
