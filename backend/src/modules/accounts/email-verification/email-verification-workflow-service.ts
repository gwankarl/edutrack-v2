import {
  confirmEmailVerificationRequestSchema,
  confirmEmailVerificationResponseSchema,
  requestEmailVerificationRequestSchema,
  requestEmailVerificationResponseSchema,
  type ConfirmEmailVerificationRequest,
  type RequestEmailVerificationRequest,
} from '@edutrack/contracts';
import type { BackendEnvironment } from '../../../infrastructure/config/environment.js';
import {
  EmailDeliveryError,
  type createEmailService,
} from '../../../infrastructure/email/email-service.js';
import { EmailVerificationIssuanceLimitError } from '../account-repository.errors.js';
import {
  findAccountForVerificationByEmail,
  type AccountForVerificationRecord,
} from '../account-repository.js';
import {
  confirmEmailVerificationToken,
  invalidateEmailVerificationToken,
  issueEmailVerificationToken,
} from './email-verification-token-service.js';

type VerificationEmailService = Pick<
  ReturnType<typeof createEmailService>,
  'sendAccountVerificationEmail'
>;

type VerificationLogger = {
  error(fields: { errorName: string }, message: string): void;
};

type VerificationWorkflowDependencies = {
  frontendOrigin: BackendEnvironment['FRONTEND_ORIGIN'];
  emailService?: VerificationEmailService;
  logger: VerificationLogger;
};

const acceptedRequest = () =>
  requestEmailVerificationResponseSchema.parse({
    success: true,
    data: { accepted: true },
  });

export function createEmailVerificationWorkflow(dependencies: VerificationWorkflowDependencies) {
  function assertDeliveryAvailable(): void {
    if (!dependencies.emailService) throw new EmailDeliveryError();
  }

  async function sendForAccount(
    account: Pick<AccountForVerificationRecord, 'id' | 'displayName' | 'email'>,
  ): Promise<void> {
    const emailService = dependencies.emailService;
    if (!emailService) throw new EmailDeliveryError();

    // Database issuance failures and throttles are distinct from SMTP failures.
    const issued = await issueEmailVerificationToken(account.id);
    const verificationUrl = new URL('/verify-email', dependencies.frontendOrigin);
    verificationUrl.searchParams.set('token', issued.token);

    try {
      await emailService.sendAccountVerificationEmail({
        to: account.email,
        displayName: account.displayName,
        actionUrl: verificationUrl.toString(),
      });
    } catch {
      try {
        await invalidateEmailVerificationToken(issued.token);
      } catch (cleanupError) {
        dependencies.logger.error(
          { errorName: cleanupError instanceof Error ? cleanupError.name : 'UnknownError' },
          'Could not invalidate an undelivered email verification token',
        );
      }

      // Never log the address, token, URL, SMTP exception, or message content.
      dependencies.logger.error(
        { errorName: 'EmailDeliveryError' },
        'Account verification email delivery failed',
      );
      throw new EmailDeliveryError();
    }
  }

  async function requestVerification(
    input: RequestEmailVerificationRequest,
  ): Promise<ReturnType<typeof acceptedRequest>> {
    const request = requestEmailVerificationRequestSchema.parse(input);
    const account = await findAccountForVerificationByEmail(request.email);

    if (!account || account.emailVerifiedAt) return acceptedRequest();
    if (!dependencies.emailService) {
      dependencies.logger.error(
        { errorName: 'EmailDeliveryError' },
        'Account verification email delivery is not configured',
      );
      return acceptedRequest();
    }

    try {
      await sendForAccount(account);
    } catch (error) {
      if (
        error instanceof EmailVerificationIssuanceLimitError ||
        error instanceof EmailDeliveryError
      ) {
        return acceptedRequest();
      }

      throw error;
    }

    return acceptedRequest();
  }

  async function confirmVerification(
    input: ConfirmEmailVerificationRequest,
  ): Promise<ReturnType<typeof confirmEmailVerificationResponseSchema.parse>> {
    const request = confirmEmailVerificationRequestSchema.parse(input);
    await confirmEmailVerificationToken(request.token);

    return confirmEmailVerificationResponseSchema.parse({
      success: true,
      data: { verified: true },
    });
  }

  return {
    assertDeliveryAvailable,
    sendForAccount,
    requestVerification,
    confirmVerification,
  };
}
