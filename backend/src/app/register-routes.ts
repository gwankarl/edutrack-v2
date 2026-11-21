import type { FastifyInstance } from 'fastify';
import type { BackendEnvironment } from '../infrastructure/config/environment.js';
import { createAuthComposition } from '../modules/accounts/authentication/auth-composition.js';
import { authRoutes } from '../modules/accounts/authentication/auth.routes.js';
import { systemRoutes } from '../modules/system/health.routes.js';

export function registerRoutes(app: FastifyInstance, environment: BackendEnvironment): void {
  app.register(systemRoutes, { prefix: '/api/v1' });

  const authComposition = createAuthComposition(environment, app.log);
  app.addHook('onClose', async () => authComposition.close());

  app.register(authRoutes, {
    prefix: '/api/v1',
    environment: {
      NODE_ENV: environment.NODE_ENV,
      FRONTEND_ORIGIN: environment.FRONTEND_ORIGIN,
    },
    verificationWorkflow: authComposition.verificationWorkflow,
    passwordResetWorkflow: authComposition.passwordResetWorkflow,
  });
}
