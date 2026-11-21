import type { FastifyPluginAsync } from 'fastify';
import type { BackendEnvironment } from '../../infrastructure/config/environment.js';
import { createEmailService } from '../../infrastructure/email/email-service.js';
import { createEmailTransport } from '../../infrastructure/email/transport.js';
import { requireTrustedOrigin } from '../../infrastructure/authentication/require-trusted-origin.js';
import { requireAuthentication } from '../../infrastructure/authentication/require-authentication.js';
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
import { createEmailVerificationWorkflow } from './email-verification-workflow-service.js';
import { createPasswordResetWorkflow } from './password-reset-workflow-service.js';

type AuthRouteOptions = Pick<
  BackendEnvironment,
  | 'NODE_ENV'
  | 'FRONTEND_ORIGIN'
  | 'SMTP_HOST'
  | 'SMTP_PORT'
  | 'SMTP_SECURE'
  | 'SMTP_USER'
  | 'SMTP_PASSWORD'
  | 'SMTP_FROM_EMAIL'
  | 'SMTP_FROM_NAME'
>;

export const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (app, environment) => {
  const emailTransport = environment.SMTP_HOST ? createEmailTransport(environment) : undefined;
  const emailService = emailTransport ? createEmailService(emailTransport, environment) : undefined;
  const verificationWorkflow = createEmailVerificationWorkflow({
    frontendOrigin: environment.FRONTEND_ORIGIN,
    emailService,
    logger: app.log,
  });
  const passwordResetWorkflow = createPasswordResetWorkflow({
    frontendOrigin: environment.FRONTEND_ORIGIN,
    emailService,
    logger: app.log,
  });

  if (emailTransport) {
    app.addHook('onClose', async () => emailTransport.close());
  }

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
