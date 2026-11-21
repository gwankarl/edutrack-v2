import { describe, expect, it, vi } from 'vitest';
import { createEmailService } from './email-service.js';

const environment = {
  NODE_ENV: 'development',
  FRONTEND_ORIGIN: 'http://localhost:5173',
  SMTP_FROM_EMAIL: 'edutrack@example.test',
  SMTP_FROM_NAME: 'EduTrack',
} as const;

describe('email service', () => {
  it('sends a verification message using its injected transport', async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const service = createEmailService({ sendMail }, environment);

    await service.sendAccountVerificationEmail({
      to: 'student@example.test',
      displayName: 'Student',
      actionUrl: 'http://localhost:5173/verify-email?token=synthetic-test-token',
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'student@example.test',
        subject: 'Verify your EduTrack email address',
        text: expect.stringContaining('synthetic-test-token'),
        html: expect.stringContaining('Verify email address'),
      }),
    );
  });

  it('sends a password reset message using its injected transport', async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const service = createEmailService({ sendMail }, environment);

    await service.sendPasswordResetEmail({
      to: 'student@example.test',
      displayName: 'Student',
      actionUrl: 'http://localhost:5173/reset-password?token=synthetic-test-token',
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'student@example.test',
        subject: 'Reset your EduTrack password',
      }),
    );
  });

  it('rejects URLs outside the configured frontend origin before sending', async () => {
    const sendMail = vi.fn();
    const service = createEmailService({ sendMail }, environment);

    await expect(
      service.sendAccountVerificationEmail({
        to: 'student@example.test',
        displayName: 'Student',
        actionUrl: 'https://attacker.example/verify?token=synthetic',
      }),
    ).rejects.toThrow(/not an allowed frontend destination/i);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('requires HTTPS for production email links', async () => {
    const sendMail = vi.fn();
    const service = createEmailService(
      { sendMail },
      {
        ...environment,
        NODE_ENV: 'production',
        FRONTEND_ORIGIN: 'https://edutrack.example.test',
      },
    );

    await expect(
      service.sendPasswordResetEmail({
        to: 'student@example.test',
        displayName: 'Student',
        actionUrl: 'http://edutrack.example.test/reset?token=synthetic',
      }),
    ).rejects.toThrow(/not an allowed frontend destination/i);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('sanitizes transport failure messages', async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error('SMTP password=sensitive-value'));
    const service = createEmailService({ sendMail }, environment);

    await expect(
      service.sendPasswordResetEmail({
        to: 'student@example.test',
        displayName: 'Student',
        actionUrl: 'http://localhost:5173/reset?token=synthetic',
      }),
    ).rejects.toThrow('Transactional email delivery failed.');
  });
});
