import cookie from '@fastify/cookie';
import type { FastifyInstance } from 'fastify';

export function registerPlugins(app: FastifyInstance): void {
  app.register(cookie, { hook: 'onRequest' });
}
