import type { FastifyInstance } from 'fastify';
import { authRoutes } from '../modules/accounts/auth.routes.js';
import { systemRoutes } from '../modules/system/health.routes.js';

export function registerRoutes(app: FastifyInstance): void {
  app.register(systemRoutes, { prefix: '/api/v1' });

  app.register(authRoutes, { prefix: '/api/v1' });
}
