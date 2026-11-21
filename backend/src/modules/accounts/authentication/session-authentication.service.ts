import { AppError } from '../../../infrastructure/errors/app-error.js';
import { ERROR_CODES } from '../../../infrastructure/errors/error-codes.js';
import {
  hashSessionToken,
  isValidSessionToken,
} from '../../../infrastructure/security/session-token.js';
import { findAccountWithRolesById } from '../account-repository.js';
import { findActiveSessionByTokenHash } from '../sessions/session-repository.js';
import type { AuthenticatedUserContext } from './authenticated-user.js';

function unauthorizedError(): AppError {
  return new AppError(ERROR_CODES.UNAUTHORIZED, 401, 'Authentication is required.');
}

export async function authenticateSessionToken(
  token: string | undefined,
): Promise<AuthenticatedUserContext> {
  if (!token || !isValidSessionToken(token)) {
    throw unauthorizedError();
  }

  const session = await findActiveSessionByTokenHash(hashSessionToken(token));

  if (!session) {
    throw unauthorizedError();
  }

  const account = await findAccountWithRolesById(session.userId);

  if (!account || account.roles.length === 0) {
    throw unauthorizedError();
  }

  return {
    id: account.id,
    displayName: account.displayName,
    email: account.email,
    roles: account.roles,
    sessionId: session.id,
  };
}
