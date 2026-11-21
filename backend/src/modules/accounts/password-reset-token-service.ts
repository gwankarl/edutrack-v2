import type { Uuid } from '@edutrack/contracts';
import { AppError } from '../../infrastructure/errors/app-error.js';
import { ERROR_CODES } from '../../infrastructure/errors/error-codes.js';
import { getPasswordResetTokenExpiration } from '../../infrastructure/security/account-token-policy.js';
import type { RawSecurityToken } from '../../infrastructure/security/security-token.js';
import {
  generateSecurityToken,
  hashSecurityToken,
  isValidSecurityToken,
} from '../../infrastructure/security/security-token.js';
import {
  consumePasswordResetToken as consumePasswordResetTokenRecord,
  findActivePasswordResetToken as findActivePasswordResetTokenRecord,
  issuePasswordResetToken as issuePasswordResetTokenRecord,
  resetPasswordWithToken as resetPasswordWithTokenRecord,
} from './password-reset-token-repository.js';

export type IssuedPasswordResetToken = {
  userId: Uuid;
  token: RawSecurityToken;
  expiresAt: Date;
};

function invalidTokenError(): AppError {
  return new AppError(
    ERROR_CODES.BAD_REQUEST,
    400,
    'The password reset token is invalid, expired, or already used.',
  );
}

/** Raw token is returned only for internal email-delivery orchestration; never log it. */
export async function issuePasswordResetToken(
  userId: Uuid,
  createdAt = new Date(),
): Promise<IssuedPasswordResetToken> {
  const token = generateSecurityToken();
  const expiresAt = getPasswordResetTokenExpiration(createdAt);

  await issuePasswordResetTokenRecord({
    userId,
    tokenHash: hashSecurityToken(token),
    createdAt,
    expiresAt,
  });

  return { userId, token, expiresAt };
}

export async function findActivePasswordResetToken(token: string) {
  if (!isValidSecurityToken(token)) return undefined;

  return findActivePasswordResetTokenRecord(hashSecurityToken(token));
}

export async function assertActivePasswordResetToken(token: string): Promise<void> {
  if (!isValidSecurityToken(token)) throw invalidTokenError();

  const active = await findActivePasswordResetTokenRecord(hashSecurityToken(token));
  if (!active) throw invalidTokenError();
}

export async function consumePasswordResetToken(token: string): Promise<Uuid> {
  if (!isValidSecurityToken(token)) throw invalidTokenError();

  const consumed = await consumePasswordResetTokenRecord(hashSecurityToken(token));

  if (!consumed) throw invalidTokenError();

  return consumed.userId;
}

/** Invalidates a newly issued token if its email could not be delivered. */
export async function invalidatePasswordResetToken(token: string): Promise<void> {
  if (!isValidSecurityToken(token)) return;

  await consumePasswordResetTokenRecord(hashSecurityToken(token));
}

/** Completes password reset using a precomputed Argon2id hash. */
export async function resetPasswordWithToken(token: string, passwordHash: string): Promise<Uuid> {
  if (!isValidSecurityToken(token)) throw invalidTokenError();

  const result = await resetPasswordWithTokenRecord(hashSecurityToken(token), passwordHash);
  if (!result) throw invalidTokenError();

  return result.userId;
}
