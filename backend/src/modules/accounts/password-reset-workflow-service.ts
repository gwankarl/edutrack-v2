import {
  completePasswordResetRequestSchema,
  completePasswordResetResponseSchema,
  requestPasswordResetRequestSchema,
  requestPasswordResetResponseSchema,
  type CompletePasswordResetRequest,
  type RequestPasswordResetRequest,
} from '@edutrack/contracts';
import type { BackendEnvironment } from '../../infrastructure/config/environment.js';
import type { createEmailService } from '../../infrastructure/email/email-service.js';
import { hashPassword } from '../../infrastructure/security/password-hasher.js';
import { PasswordResetIssuanceLimitError } from './account-repository.errors.js';
import { findAccountForPasswordResetByEmail } from './account-repository.js';
import {
  assertActivePasswordResetToken,
  invalidatePasswordResetToken,
  issuePasswordResetToken,
  resetPasswordWithToken,
} from './password-reset-token-service.js';

type ResetEmailService = Pick<ReturnType<typeof createEmailService>, 'sendPasswordResetEmail'>;

type ResetLogger = {
  error(fields: { errorName: string }, message: string): void;
};

type PasswordResetWorkflowDependencies = {
  frontendOrigin: BackendEnvironment['FRONTEND_ORIGIN'];
  emailService?: ResetEmailService;
  logger: ResetLogger;
  findAccount?: typeof findAccountForPasswordResetByEmail;
  issueToken?: typeof issuePasswordResetToken;
  invalidateToken?: typeof invalidatePasswordResetToken;
  assertActiveToken?: typeof assertActivePasswordResetToken;
  hashPassword?: typeof hashPassword;
  resetWithToken?: typeof resetPasswordWithToken;
};

function acceptedResponse() {
  return requestPasswordResetResponseSchema.parse({
    success: true,
    data: { accepted: true },
  });
}

export function createPasswordResetWorkflow(dependencies: PasswordResetWorkflowDependencies) {
  const findAccount = dependencies.findAccount ?? findAccountForPasswordResetByEmail;
  const issueToken = dependencies.issueToken ?? issuePasswordResetToken;
  const invalidateToken = dependencies.invalidateToken ?? invalidatePasswordResetToken;
  const assertActiveToken = dependencies.assertActiveToken ?? assertActivePasswordResetToken;
  const hash = dependencies.hashPassword ?? hashPassword;
  const resetWithToken = dependencies.resetWithToken ?? resetPasswordWithToken;

  async function requestReset(input: RequestPasswordResetRequest) {
    const request = requestPasswordResetRequestSchema.parse(input);
    const account = await findAccount(request.email);

    if (!account) return acceptedResponse();

    if (!dependencies.emailService) {
      dependencies.logger.error(
        { errorName: 'EmailDeliveryError' },
        'Password reset email delivery is not configured',
      );
      return acceptedResponse();
    }

    let issued: Awaited<ReturnType<typeof issueToken>>;

    try {
      issued = await issueToken(account.id);
    } catch (error) {
      if (!(error instanceof PasswordResetIssuanceLimitError)) {
        // Persistence details and account existence are not exposed to callers.
        dependencies.logger.error(
          { errorName: error instanceof Error ? error.name : 'UnknownError' },
          'Could not issue a password reset token',
        );
      }
      return acceptedResponse();
    }

    const resetUrl = new URL('/reset-password', dependencies.frontendOrigin);
    resetUrl.searchParams.set('token', issued.token);

    try {
      await dependencies.emailService.sendPasswordResetEmail({
        to: account.email,
        displayName: account.displayName,
        actionUrl: resetUrl.toString(),
      });
    } catch {
      try {
        await invalidateToken(issued.token);
      } catch (cleanupError) {
        dependencies.logger.error(
          { errorName: cleanupError instanceof Error ? cleanupError.name : 'UnknownError' },
          'Could not invalidate an undelivered password reset token',
        );
      }

      // Never log the address, raw token, URL, message, or SMTP exception.
      dependencies.logger.error(
        { errorName: 'EmailDeliveryError' },
        'Password reset email delivery failed',
      );
    }

    // `accepted` acknowledges the request, not successful SMTP delivery.
    return acceptedResponse();
  }

  async function completeReset(input: CompletePasswordResetRequest) {
    const request = completePasswordResetRequestSchema.parse(input);

    // Check before the expensive hash. The transactional repository checks again
    // so expiration and concurrent consumption are still enforced atomically.
    await assertActiveToken(request.token);
    const passwordHash = await hash(request.newPassword);
    await resetWithToken(request.token, passwordHash);

    return completePasswordResetResponseSchema.parse({
      success: true,
      data: { passwordReset: true },
    });
  }

  return { requestReset, completeReset };
}
