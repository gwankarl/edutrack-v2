import type { Transporter } from 'nodemailer';
import type { BackendEnvironment } from '../config/environment.js';
import { renderAccountVerificationEmail } from './templates/account-verification.js';
import { renderPasswordResetEmail } from './templates/password-reset.js';

type EmailTransport = Pick<Transporter, 'sendMail'>;
type EmailEnvironment = Pick<
  BackendEnvironment,
  'NODE_ENV' | 'FRONTEND_ORIGIN' | 'SMTP_FROM_EMAIL' | 'SMTP_FROM_NAME'
>;

type AccountEmailInput = { to: string; displayName: string; actionUrl: string };

export class EmailDeliveryError extends Error {
  constructor() {
    super('Transactional email delivery failed.');
    this.name = 'EmailDeliveryError';
  }
}

function validateActionUrl(actionUrl: string, environment: EmailEnvironment): string {
  let candidate: URL;
  let frontend: URL;

  try {
    candidate = new URL(actionUrl);
    frontend = new URL(environment.FRONTEND_ORIGIN);
  } catch {
    throw new Error('Account email URL is invalid.');
  }

  const allowedProtocols =
    ['https:', 'http:'].includes(candidate.protocol) &&
    ['https:', 'http:'].includes(frontend.protocol);
  const noCredentials =
    !candidate.username && !candidate.password && !frontend.username && !frontend.password;

  if (
    !allowedProtocols ||
    !noCredentials ||
    candidate.origin !== frontend.origin ||
    (environment.NODE_ENV === 'production' && candidate.protocol !== 'https:')
  ) {
    throw new Error('Account email URL is not an allowed frontend destination.');
  }

  return candidate.toString();
}

export function createEmailService(transport: EmailTransport, environment: EmailEnvironment) {
  async function send(
    input: AccountEmailInput,
    render: (values: { displayName: string; url: string }) => {
      subject: string;
      text: string;
      html: string;
    },
  ): Promise<void> {
    if (!environment.SMTP_FROM_EMAIL) throw new EmailDeliveryError();

    const message = render({
      displayName: input.displayName,
      url: validateActionUrl(input.actionUrl, environment),
    });

    try {
      await transport.sendMail({
        from: { name: environment.SMTP_FROM_NAME, address: environment.SMTP_FROM_EMAIL },
        to: input.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } catch {
      // Provider exceptions can contain sensitive connection details.
      throw new EmailDeliveryError();
    }
  }

  return {
    sendAccountVerificationEmail(input: AccountEmailInput): Promise<void> {
      return send(input, ({ displayName, url }) =>
        renderAccountVerificationEmail({ displayName, verificationUrl: url }),
      );
    },
    sendPasswordResetEmail(input: AccountEmailInput): Promise<void> {
      return send(input, ({ displayName, url }) =>
        renderPasswordResetEmail({ displayName, resetUrl: url }),
      );
    },
  };
}
