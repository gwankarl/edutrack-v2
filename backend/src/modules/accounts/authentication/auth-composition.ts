import type { FastifyBaseLogger } from 'fastify';
import type { BackendEnvironment } from '../../../infrastructure/config/environment.js';
import { createEmailService } from '../../../infrastructure/email/email-service.js';
import { createEmailTransport } from '../../../infrastructure/email/transport.js';
import { createEmailVerificationWorkflow } from '../email-verification/email-verification-workflow-service.js';
import { createPasswordResetWorkflow } from '../password-management/password-reset-workflow-service.js';

type AuthCompositionEnvironment = Pick<
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

export function createAuthComposition(
  environment: AuthCompositionEnvironment,
  logger: FastifyBaseLogger,
) {
  const emailTransport = environment.SMTP_HOST ? createEmailTransport(environment) : undefined;
  const emailService = emailTransport ? createEmailService(emailTransport, environment) : undefined;

  return {
    verificationWorkflow: createEmailVerificationWorkflow({
      frontendOrigin: environment.FRONTEND_ORIGIN,
      emailService,
      logger,
    }),
    passwordResetWorkflow: createPasswordResetWorkflow({
      frontendOrigin: environment.FRONTEND_ORIGIN,
      emailService,
      logger,
    }),
    close: async () => emailTransport?.close(),
  };
}
