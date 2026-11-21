import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../infrastructure/errors/app-error.js';
import { ERROR_CODES } from '../../infrastructure/errors/error-codes.js';
import { EmailDeliveryError } from '../../infrastructure/email/email-service.js';
import { PasswordResetIssuanceLimitError } from './account-repository.errors.js';
import { createPasswordResetWorkflow } from './password-reset-workflow-service.js';

const account = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  displayName: 'Test Student',
  email: 'student@example.test',
};
const token = 'A'.repeat(43);

describe('password reset workflow', () => {
  const findAccount = vi.fn();
  const issueToken = vi.fn();
  const invalidateToken = vi.fn();
  const assertActiveToken = vi.fn();
  const hashPassword = vi.fn();
  const resetWithToken = vi.fn();
  const sendPasswordResetEmail = vi.fn();
  const logger = { error: vi.fn() };

  function makeWorkflow() {
    return createPasswordResetWorkflow({
      frontendOrigin: 'http://localhost:5173',
      emailService: { sendPasswordResetEmail },
      logger,
      findAccount,
      issueToken,
      invalidateToken,
      assertActiveToken,
      hashPassword,
      resetWithToken,
    });
  }

  beforeEach(() => {
    vi.resetAllMocks();
    findAccount.mockResolvedValue(account);
    issueToken.mockResolvedValue({
      userId: account.id,
      token,
      expiresAt: new Date(Date.now() + 60_000),
    });
    invalidateToken.mockResolvedValue(undefined);
    assertActiveToken.mockResolvedValue(undefined);
    hashPassword.mockResolvedValue('$argon2id$test-hash');
    resetWithToken.mockResolvedValue(account.id);
    sendPasswordResetEmail.mockResolvedValue(undefined);
  });

  it('sends a reset email using the configured frontend origin and returns generic data', async () => {
    const response = await makeWorkflow().requestReset({ email: ' STUDENT@Example.test ' });

    expect(response).toEqual({ success: true, data: { accepted: true } });
    expect(findAccount).toHaveBeenCalledWith('student@example.test');
    expect(sendPasswordResetEmail).toHaveBeenCalledWith({
      to: account.email,
      displayName: account.displayName,
      actionUrl: `http://localhost:5173/reset-password?token=${token}`,
    });
    expect(JSON.stringify(response)).not.toContain(token);
    expect(JSON.stringify(response)).not.toContain(account.email);
  });

  it('returns the same accepted response for an unknown account', async () => {
    findAccount.mockResolvedValue(undefined);

    await expect(makeWorkflow().requestReset({ email: 'missing@example.test' })).resolves.toEqual({
      success: true,
      data: { accepted: true },
    });
    expect(issueToken).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('returns the generic result when account-specific issuance is throttled', async () => {
    issueToken.mockRejectedValue(new PasswordResetIssuanceLimitError());

    await expect(makeWorkflow().requestReset({ email: account.email })).resolves.toEqual({
      success: true,
      data: { accepted: true },
    });
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('invalidates an undelivered token without logging its value or URL', async () => {
    sendPasswordResetEmail.mockRejectedValue(new EmailDeliveryError());

    await expect(makeWorkflow().requestReset({ email: account.email })).resolves.toEqual({
      success: true,
      data: { accepted: true },
    });
    expect(invalidateToken).toHaveBeenCalledWith(token);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(token);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('reset-password?');
  });

  it('hashes the new password before requesting atomic token completion', async () => {
    const response = await makeWorkflow().completeReset({
      token,
      newPassword: 'a sufficiently long new passphrase',
    });

    expect(assertActiveToken).toHaveBeenCalledWith(token);
    expect(hashPassword).toHaveBeenCalledWith('a sufficiently long new passphrase');
    expect(resetWithToken).toHaveBeenCalledWith(token, '$argon2id$test-hash');
    expect(response).toEqual({ success: true, data: { passwordReset: true } });
    expect(JSON.stringify(response)).not.toContain(token);
    expect(JSON.stringify(response)).not.toContain('$argon2id$');
  });

  it('does not hash a password when the reset token is invalid', async () => {
    assertActiveToken.mockRejectedValue(
      new AppError(
        ERROR_CODES.BAD_REQUEST,
        400,
        'The password reset token is invalid, expired, or already used.',
      ),
    );

    await expect(
      makeWorkflow().completeReset({
        token,
        newPassword: 'a sufficiently long new passphrase',
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.BAD_REQUEST, statusCode: 400 });
    expect(hashPassword).not.toHaveBeenCalled();
    expect(resetWithToken).not.toHaveBeenCalled();
  });

  it('does not report successful completion when persistence fails', async () => {
    resetWithToken.mockRejectedValue(new Error('database internal detail'));

    await expect(
      makeWorkflow().completeReset({
        token,
        newPassword: 'a sufficiently long new passphrase',
      }),
    ).rejects.toThrow('database internal detail');
  });
});
