import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import type { BackendEnvironment } from '../infrastructure/config/environment.js';

export function registerPlugins(app: FastifyInstance, environment: BackendEnvironment): void {
  app.register(cors, {
    origin: environment.FRONTEND_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['content-type'],
  });

  app.register(cookie, { hook: 'onRequest' });

  app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) => {
      const error = new Error('Rate limit exceeded.');
      Object.assign(error, { statusCode: context.statusCode });
      return error;
    },
  });
}
