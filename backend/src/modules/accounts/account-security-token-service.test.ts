import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../infrastructure/errors/app-error.js';
import { ERROR_CODES } from '../../infrastructure/errors/error-codes.js';
import {
  hashSecurityToken,
  isValidSecurityToken,
} from '../../infrastructure/security/security-token.js';

const mocks = vi.hoisted(() => ({
  issueEmailVerificationToken: vi.fn(),
  findActiveEmailVerificationToken: vi.fn(),
  consumeEmailVerificationToken: vi.fn(),
  issuePasswordResetToken: vi.fn(),
  findActivePasswordResetToken: vi.fn(),
  consumePasswordResetToken: vi.fn(),
}));

vi.mock('./email-verification/email-verification-token-repository.js', () => ({
  issueEmailVerificationToken: mocks.issueEmailVerificationToken,
  findActiveEmailVerificationToken: mocks.findActiveEmailVerificationToken,
  consumeEmailVerificationToken: mocks.consumeEmailVerificationToken,
}));

vi.mock('./password-management/password-reset-token-repository.js', () => ({
  issuePasswordResetToken: mocks.issuePasswordResetToken,
  findActivePasswordResetToken: mocks.findActivePasswordResetToken,
  consumePasswordResetToken: mocks.consumePasswordResetToken,
}));

import {
  consumeEmailVerificationToken,
  findActiveEmailVerificationToken,
  issueEmailVerificationToken,
} from './email-verification/email-verification-token-service.js';
import {
  consumePasswordResetToken,
  findActivePasswordResetToken,
  issuePasswordResetToken,
} from './password-management/password-reset-token-service.js';

const userId = '550e8400-e29b-41d4-a716-446655440000';
const record = {
  id: 'd9428888-122b-4b86-b1d4-6a4e4b3b8c11',
  userId,
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 60_000),
  consumedAt: null,
};

describe('account security token services', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('issues email verification tokens with only their hash sent to persistence', async () => {
    const startedAt = Date.now();
    const issued = await issueEmailVerificationToken(userId);

    expect(isValidSecurityToken(issued.token)).toBe(true);
    expect(issued.userId).toBe(userId);
    expect(issued.expiresAt.getTime()).toBeGreaterThan(startedAt);
    expect(mocks.issueEmailVerificationToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        tokenHash: hashSecurityToken(issued.token),
        createdAt: expect.any(Date),
        expiresAt: issued.expiresAt,
      }),
    );
    expect(mocks.issueEmailVerificationToken.mock.calls[0]?.[0]).not.toHaveProperty('token');
  });

  it('looks up email tokens by hash and ignores malformed input', async () => {
    const token = 'A'.repeat(43);
    mocks.findActiveEmailVerificationToken.mockResolvedValue(record);

    await expect(findActiveEmailVerificationToken(token)).resolves.toEqual(record);
    expect(mocks.findActiveEmailVerificationToken).toHaveBeenCalledWith(hashSecurityToken(token));

    mocks.findActiveEmailVerificationToken.mockClear();
    await expect(findActiveEmailVerificationToken('malformed')).resolves.toBeUndefined();
    expect(mocks.findActiveEmailVerificationToken).not.toHaveBeenCalled();
  });

  it('returns the account ID on successful email-token consumption and standardizes invalid tokens', async () => {
    mocks.consumeEmailVerificationToken.mockResolvedValue(record);

    await expect(consumeEmailVerificationToken('B'.repeat(43))).resolves.toBe(userId);
    expect(mocks.consumeEmailVerificationToken).toHaveBeenCalledWith(
      hashSecurityToken('B'.repeat(43)),
    );

    mocks.consumeEmailVerificationToken.mockResolvedValue(undefined);
    await expect(consumeEmailVerificationToken('B'.repeat(43))).rejects.toMatchObject({
      code: ERROR_CODES.BAD_REQUEST,
      statusCode: 400,
    });
    await expect(consumeEmailVerificationToken('bad')).rejects.toBeInstanceOf(AppError);
  });

  it('issues password-reset tokens with only their hash sent to persistence', async () => {
    const startedAt = Date.now();
    const issued = await issuePasswordResetToken(userId);

    expect(isValidSecurityToken(issued.token)).toBe(true);
    expect(issued.userId).toBe(userId);
    expect(issued.expiresAt.getTime()).toBeGreaterThan(startedAt);
    expect(mocks.issuePasswordResetToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        tokenHash: hashSecurityToken(issued.token),
        createdAt: expect.any(Date),
        expiresAt: issued.expiresAt,
      }),
    );
    expect(mocks.issuePasswordResetToken.mock.calls[0]?.[0]).not.toHaveProperty('token');
  });

  it('looks up reset tokens by hash and consumes them once at the service boundary', async () => {
    const token = 'C'.repeat(43);
    mocks.findActivePasswordResetToken.mockResolvedValue(record);
    mocks.consumePasswordResetToken.mockResolvedValue(record);

    await expect(findActivePasswordResetToken(token)).resolves.toEqual(record);
    expect(mocks.findActivePasswordResetToken).toHaveBeenCalledWith(hashSecurityToken(token));
    await expect(consumePasswordResetToken(token)).resolves.toBe(userId);
    expect(mocks.consumePasswordResetToken).toHaveBeenCalledWith(hashSecurityToken(token));

    mocks.consumePasswordResetToken.mockResolvedValue(undefined);
    await expect(consumePasswordResetToken(token)).rejects.toMatchObject({
      code: ERROR_CODES.BAD_REQUEST,
      statusCode: 400,
    });
    await expect(consumePasswordResetToken('bad')).rejects.toBeInstanceOf(AppError);
  });
});
