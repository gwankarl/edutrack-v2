import type { FastifyInstance } from 'fastify';
import type { BackendEnvironment } from '../infrastructure/config/environment.js';
import { authRoutes } from '../modules/accounts/auth.routes.js';
import { systemRoutes } from '../modules/system/health.routes.js';

export function registerRoutes(app: FastifyInstance, environment: BackendEnvironment): void {
  app.register(systemRoutes, { prefix: '/api/v1' });

  app.register(authRoutes, {
    prefix: '/api/v1',
    NODE_ENV: environment.NODE_ENV,
    FRONTEND_ORIGIN: environment.FRONTEND_ORIGIN,
  });
}
