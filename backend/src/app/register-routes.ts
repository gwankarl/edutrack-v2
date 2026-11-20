import type { FastifyInstance } from 'fastify';
import { systemRoutes } from '../modules/system/health.routes.js';

export function registerRoutes(app: FastifyInstance): void {
  app.register(systemRoutes, { prefix: '/api/v1' });
}
