import nodemailer, { type Transporter } from 'nodemailer';
import type { BackendEnvironment } from '../config/environment.js';

type SmtpEnvironment = Pick<
  BackendEnvironment,
  'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_SECURE' | 'SMTP_USER' | 'SMTP_PASSWORD'
>;

export function createEmailTransport(environment: SmtpEnvironment): Transporter {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = environment;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) {
    throw new Error('SMTP email delivery is not configured.');
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: environment.SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { minVersion: 'TLSv1.2' },
  });
}
