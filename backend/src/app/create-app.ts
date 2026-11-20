import Fastify from 'fastify';
import type { BackendEnvironment } from '../infrastructure/config/environment.js';
import { registerErrorHandlers } from '../infrastructure/errors/error-handler.js';
import { createFastifyOptions } from '../infrastructure/logging/fastify-options.js';
import { registerRoutes } from './register-routes.js';

export function createApp(environment: BackendEnvironment) {
  const app = Fastify(createFastifyOptions(environment));

  registerErrorHandlers(app);

  registerRoutes(app);

  return app;
}
