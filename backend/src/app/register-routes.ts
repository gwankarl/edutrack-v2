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
    SMTP_HOST: environment.SMTP_HOST,
    SMTP_PORT: environment.SMTP_PORT,
    SMTP_SECURE: environment.SMTP_SECURE,
    SMTP_USER: environment.SMTP_USER,
    SMTP_PASSWORD: environment.SMTP_PASSWORD,
    SMTP_FROM_EMAIL: environment.SMTP_FROM_EMAIL,
    SMTP_FROM_NAME: environment.SMTP_FROM_NAME,
  });
}
