import type { Uuid } from '@edutrack/contracts';
import { AppError } from '../../infrastructure/errors/app-error.js';
import { ERROR_CODES } from '../../infrastructure/errors/error-codes.js';
import { getEmailVerificationTokenExpiration } from '../../infrastructure/security/account-token-policy.js';
import type { RawSecurityToken } from '../../infrastructure/security/security-token.js';
import {
  generateSecurityToken,
  hashSecurityToken,
  isValidSecurityToken,
} from '../../infrastructure/security/security-token.js';
import {
  consumeEmailVerificationToken as consumeEmailVerificationTokenRecord,
  confirmEmailVerification as confirmEmailVerificationRecord,
  findActiveEmailVerificationToken as findActiveEmailVerificationTokenRecord,
  issueEmailVerificationToken as issueEmailVerificationTokenRecord,
} from './email-verification-token-repository.js';

export type IssuedEmailVerificationToken = {
  userId: Uuid;
  token: RawSecurityToken;
  expiresAt: Date;
};

function invalidTokenError(): AppError {
  return new AppError(
    ERROR_CODES.BAD_REQUEST,
    400,
    'The email verification token is invalid, expired, or already used.',
  );
}

/** Raw token is returned only for internal email-delivery orchestration; never log it. */
export async function issueEmailVerificationToken(
  userId: Uuid,
  createdAt = new Date(),
): Promise<IssuedEmailVerificationToken> {
  const token = generateSecurityToken();
  const expiresAt = getEmailVerificationTokenExpiration(createdAt);

  await issueEmailVerificationTokenRecord({
    userId,
    tokenHash: hashSecurityToken(token),
    createdAt,
    expiresAt,
  });

  return { userId, token, expiresAt };
}

export async function findActiveEmailVerificationToken(token: string) {
  if (!isValidSecurityToken(token)) return undefined;

  return findActiveEmailVerificationTokenRecord(hashSecurityToken(token));
}

export async function consumeEmailVerificationToken(token: string): Promise<Uuid> {
  if (!isValidSecurityToken(token)) throw invalidTokenError();

  const consumed = await consumeEmailVerificationTokenRecord(hashSecurityToken(token));

  if (!consumed) throw invalidTokenError();

  return consumed.userId;
}

export async function invalidateEmailVerificationToken(token: string): Promise<void> {
  if (!isValidSecurityToken(token)) return;

  await consumeEmailVerificationTokenRecord(hashSecurityToken(token));
}

export async function confirmEmailVerificationToken(token: string): Promise<Uuid> {
  if (!isValidSecurityToken(token)) throw invalidTokenError();

  const confirmed = await confirmEmailVerificationRecord(hashSecurityToken(token));

  if (!confirmed) throw invalidTokenError();

  return confirmed.userId;
}
