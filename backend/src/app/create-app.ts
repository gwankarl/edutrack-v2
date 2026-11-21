import Fastify from 'fastify';
import type { BackendEnvironment } from '../infrastructure/config/environment.js';
import { registerErrorHandlers } from '../infrastructure/errors/error-handler.js';
import { createFastifyOptions } from '../infrastructure/logging/fastify-options.js';
import { registerRoutes } from './register-routes.js';
import { registerPlugins } from './register-plugins.js';

export function createApp(environment: BackendEnvironment) {
  const app = Fastify(createFastifyOptions(environment));

  registerErrorHandlers(app);

  registerPlugins(app, environment);

  registerRoutes(app, environment);

  return app;
}
