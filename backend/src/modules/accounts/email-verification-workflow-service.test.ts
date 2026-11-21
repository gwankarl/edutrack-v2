import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../infrastructure/errors/error-codes.js';

const mocks = vi.hoisted(() => ({
  findAccountForVerificationByEmail: vi.fn(),
  issueEmailVerificationToken: vi.fn(),
  invalidateEmailVerificationToken: vi.fn(),
  confirmEmailVerificationToken: vi.fn(),
}));

vi.mock('./account-repository.js', () => ({
  findAccountForVerificationByEmail: mocks.findAccountForVerificationByEmail,
}));

vi.mock('./email-verification-token-service.js', () => ({
  issueEmailVerificationToken: mocks.issueEmailVerificationToken,
  invalidateEmailVerificationToken: mocks.invalidateEmailVerificationToken,
  confirmEmailVerificationToken: mocks.confirmEmailVerificationToken,
}));

import { EmailDeliveryError } from '../../infrastructure/email/email-service.js';
import { EmailVerificationIssuanceLimitError } from './account-repository.errors.js';
import { createEmailVerificationWorkflow } from './email-verification-workflow-service.js';

const account = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  displayName: 'Sample Student',
  email: 'student@example.test',
  emailVerifiedAt: null,
};
const token = 'A'.repeat(43);

describe('email verification workflow', () => {
  const sendAccountVerificationEmail = vi.fn();
  const logger = { error: vi.fn() };

  function makeWorkflow() {
    return createEmailVerificationWorkflow({
      frontendOrigin: 'http://localhost:5173',
      emailService: { sendAccountVerificationEmail },
      logger,
    });
  }

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.issueEmailVerificationToken.mockResolvedValue({
      userId: account.id,
      token,
      expiresAt: new Date(Date.now() + 60_000),
    });
    mocks.invalidateEmailVerificationToken.mockResolvedValue(undefined);
    mocks.confirmEmailVerificationToken.mockResolvedValue(account.id);
    sendAccountVerificationEmail.mockResolvedValue(undefined);
  });

  it('sends a verification URL for an eligible account without returning the token', async () => {
    mocks.findAccountForVerificationByEmail.mockResolvedValue(account);

    const response = await makeWorkflow().requestVerification({ email: ' STUDENT@Example.test ' });

    expect(response).toEqual({ success: true, data: { accepted: true } });
    expect(mocks.issueEmailVerificationToken).toHaveBeenCalledWith(account.id);
    expect(sendAccountVerificationEmail).toHaveBeenCalledWith({
      to: account.email,
      displayName: account.displayName,
      actionUrl: `http://localhost:5173/verify-email?token=${token}`,
    });
    expect(JSON.stringify(response)).not.toContain(token);
  });

  it('returns the generic accepted response for an unknown account', async () => {
    mocks.findAccountForVerificationByEmail.mockResolvedValue(undefined);

    await expect(
      makeWorkflow().requestVerification({ email: 'unknown@example.test' }),
    ).resolves.toEqual({ success: true, data: { accepted: true } });
    expect(mocks.issueEmailVerificationToken).not.toHaveBeenCalled();
    expect(sendAccountVerificationEmail).not.toHaveBeenCalled();
  });

  it('does not issue another token for an already verified account', async () => {
    mocks.findAccountForVerificationByEmail.mockResolvedValue({
      ...account,
      emailVerifiedAt: new Date(),
    });

    await expect(makeWorkflow().requestVerification({ email: account.email })).resolves.toEqual({
      success: true,
      data: { accepted: true },
    });
    expect(mocks.issueEmailVerificationToken).not.toHaveBeenCalled();
  });

  it('returns the generic accepted response when resend issuance is throttled', async () => {
    mocks.findAccountForVerificationByEmail.mockResolvedValue(account);
    mocks.issueEmailVerificationToken.mockRejectedValue(new EmailVerificationIssuanceLimitError());

    await expect(makeWorkflow().requestVerification({ email: account.email })).resolves.toEqual({
      success: true,
      data: { accepted: true },
    });
    expect(sendAccountVerificationEmail).not.toHaveBeenCalled();
  });

  it('invalidates an undelivered token and keeps failure logs free of token data', async () => {
    mocks.findAccountForVerificationByEmail.mockResolvedValue(account);
    sendAccountVerificationEmail.mockRejectedValue(new EmailDeliveryError());

    await expect(makeWorkflow().requestVerification({ email: account.email })).resolves.toEqual({
      success: true,
      data: { accepted: true },
    });

    expect(mocks.invalidateEmailVerificationToken).toHaveBeenCalledWith(token);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(token);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('verificationUrl');
  });

  it('confirms through the atomic token-and-user operation and returns only the verified flag', async () => {
    const response = await makeWorkflow().confirmVerification({ token });

    expect(mocks.confirmEmailVerificationToken).toHaveBeenCalledWith(token);
    expect(response).toEqual({ success: true, data: { verified: true } });
    expect(JSON.stringify(response)).not.toContain(token);
  });

  it('propagates the shared invalid-token application error', async () => {
    mocks.confirmEmailVerificationToken.mockRejectedValue({
      code: ERROR_CODES.BAD_REQUEST,
      statusCode: 400,
    });

    await expect(makeWorkflow().confirmVerification({ token })).rejects.toMatchObject({
      code: ERROR_CODES.BAD_REQUEST,
      statusCode: 400,
    });
  });
});
