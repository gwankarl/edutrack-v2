import { parseEnvironment } from '../config/environment.js';
import { createEmailTransport } from './transport.js';

async function main(): Promise<void> {
  const operation = process.argv[2];
  if (operation !== 'verify' && operation !== 'send-test') {
    console.error('Choose either the verify or send-test operation.');
    process.exitCode = 1;
    return;
  }

  const environment = parseEnvironment();
  if (
    environment.NODE_ENV !== 'development' ||
    environment.SMTP_HOST !== 'sandbox.smtp.mailtrap.io' ||
    !environment.SMTP_FROM_EMAIL
  ) {
    console.error('Mailtrap diagnostics require development mode and the Mailtrap sandbox host.');
    process.exitCode = 1;
    return;
  }

  const transport = createEmailTransport(environment);
  try {
    await transport.verify();
    console.info('Mailtrap SMTP connection verified.');

    if (operation === 'send-test') {
      await transport.sendMail({
        from: { name: environment.SMTP_FROM_NAME, address: environment.SMTP_FROM_EMAIL },
        to: 'edutrack-smoke-test@example.test',
        subject: 'EduTrack Mailtrap sandbox check',
        text: 'This synthetic message verifies the EduTrack Mailtrap sandbox configuration.',
        html: '<p>This synthetic message verifies the EduTrack Mailtrap sandbox configuration.</p>',
      });
      console.info('Synthetic message accepted by the Mailtrap sandbox.');
    }
  } catch {
    console.error('Mailtrap SMTP check failed. Review sandbox settings and network access.');
    process.exitCode = 1;
  } finally {
    transport.close();
  }
}

await main();
