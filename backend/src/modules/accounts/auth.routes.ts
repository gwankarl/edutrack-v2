import type { FastifyPluginAsync } from 'fastify';
import type { BackendEnvironment } from '../../infrastructure/config/environment.js';
import { requireTrustedOrigin } from '../../infrastructure/authentication/require-trusted-origin.js';
import { requireAuthentication } from '../../infrastructure/authentication/require-authentication.js';
import { loginAccountController, registerAccountController } from './auth.controller.js';
import { getCurrentUserController } from './current-user.controller.js';
import { logoutController } from './logout.controller.js';

type AuthRouteOptions = Pick<BackendEnvironment, 'NODE_ENV' | 'FRONTEND_ORIGIN'>;

export const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (app, environment) => {
  app.post('/auth/register', registerAccountController);

  app.post('/auth/login', (request, reply) => loginAccountController(request, reply, environment));

  app.post(
    '/auth/logout',
    { preHandler: requireTrustedOrigin(environment.FRONTEND_ORIGIN) },
    (request, reply) => logoutController(request, reply, environment),
  );

  app.get('/auth/me', { preHandler: requireAuthentication }, getCurrentUserController);
};
