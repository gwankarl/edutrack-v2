import type { FastifyPluginAsync } from 'fastify';
import type { BackendEnvironment } from '../../../infrastructure/config/environment.js';
import { requireTrustedOrigin } from '../../../infrastructure/authentication/require-trusted-origin.js';
import { requireAuthentication } from './require-authentication.js';
import {
  changePasswordController,
  completePasswordResetController,
  confirmEmailVerificationController,
  loginAccountController,
  registerAccountController,
  requestEmailVerificationController,
  requestPasswordResetController,
} from './auth.controller.js';
import { getCurrentUserController } from './current-user.controller.js';
import { logoutController } from './logout.controller.js';
import { updateProfileController } from '../profile/profile-controller.js';
import type { createEmailVerificationWorkflow } from '../email-verification/email-verification-workflow-service.js';
import type { createPasswordResetWorkflow } from '../password-management/password-reset-workflow-service.js';

type AuthRouteOptions = {
  environment: Pick<BackendEnvironment, 'NODE_ENV' | 'FRONTEND_ORIGIN'>;
  verificationWorkflow: ReturnType<typeof createEmailVerificationWorkflow>;
  passwordResetWorkflow: ReturnType<typeof createPasswordResetWorkflow>;
};

export const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (app, options) => {
  const { environment, verificationWorkflow, passwordResetWorkflow } = options;

  app.post('/auth/register', (request, reply) =>
    registerAccountController(request, reply, verificationWorkflow),
  );

  app.post('/auth/login', (request, reply) => loginAccountController(request, reply, environment));

  app.post(
    '/auth/logout',
    { preHandler: requireTrustedOrigin(environment.FRONTEND_ORIGIN) },
    (request, reply) => logoutController(request, reply, environment),
  );

  app.get('/auth/me', { preHandler: requireAuthentication }, getCurrentUserController);

  const trustedOrigin = requireTrustedOrigin(environment.FRONTEND_ORIGIN);

  app.patch(
    '/auth/me',
    {
      preHandler: [trustedOrigin, requireAuthentication],
    },
    updateProfileController,
  );

  app.post(
    '/auth/email-verification/request',
    {
      preHandler: trustedOrigin,
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '15 minutes',
          groupId: 'account-email-requests',
        },
      },
    },
    (request, reply) => requestEmailVerificationController(request, reply, verificationWorkflow),
  );

  app.post(
    '/auth/email-verification/confirm',
    {
      preHandler: trustedOrigin,
      config: {
        rateLimit: { max: 10, timeWindow: '15 minutes', groupId: 'account-token-submissions' },
      },
    },
    (request, reply) => confirmEmailVerificationController(request, reply, verificationWorkflow),
  );

  app.post(
    '/auth/password/forgot',
    {
      preHandler: trustedOrigin,
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '15 minutes',
          groupId: 'account-email-requests',
        },
      },
    },
    (request, reply) => requestPasswordResetController(request, reply, passwordResetWorkflow),
  );

  app.post(
    '/auth/password/reset',
    {
      preHandler: trustedOrigin,
      config: {
        rateLimit: { max: 10, timeWindow: '15 minutes', groupId: 'account-token-submissions' },
      },
    },
    (request, reply) => completePasswordResetController(request, reply, passwordResetWorkflow),
  );

  app.post(
    '/auth/password/change',
    {
      preHandler: [trustedOrigin, requireAuthentication],
      config: {
        rateLimit: { max: 5, timeWindow: '15 minutes', groupId: 'password-change' },
      },
    },
    (request, reply) => changePasswordController(request, reply, environment),
  );
};
