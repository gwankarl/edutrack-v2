import {
  loginRequestSchema,
  loginResponseSchema,
  type Uuid,
  type LoginRequest,
  type LoginResponse,
} from '@edutrack/contracts';
import { getSessionExpiration } from '../../../infrastructure/security/session-policy.js';
import {
  generateSessionToken,
  hashSessionToken,
} from '../../../infrastructure/security/session-token.js';
import { AppError } from '../../../infrastructure/errors/app-error.js';
import { ERROR_CODES } from '../../../infrastructure/errors/error-codes.js';
import { verifyPassword } from '../../../infrastructure/security/password-hasher.js';
import { findAccountForAuthenticationByEmail } from '../account-repository.js';
import { createSession, revokeSessionById } from '../sessions/session-repository.js';

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';

export type LoginResult = {
  response: LoginResponse;
  session: {
    id: Uuid;
    expiresAt: Date;
  };
  sessionToken: string;
};

function invalidCredentialsError(): AppError {
  return new AppError(ERROR_CODES.UNAUTHORIZED, 401, INVALID_CREDENTIALS_MESSAGE);
}

export async function loginAccount(input: LoginRequest): Promise<LoginResult> {
  const request = loginRequestSchema.parse(input);
  const account = await findAccountForAuthenticationByEmail(request.email);

  if (!account) {
    throw invalidCredentialsError();
  }

  const passwordMatches = await verifyPassword(request.password, account.passwordHash);

  if (!passwordMatches) {
    throw invalidCredentialsError();
  }

  const response = loginResponseSchema.parse({
    success: true,
    data: {
      id: account.id,
      displayName: account.displayName,
      email: account.email,
    },
  });

  const sessionToken = generateSessionToken();
  const session = await createSession({
    userId: account.id,
    tokenHash: hashSessionToken(sessionToken),
    expiresAt: getSessionExpiration(),
  });

  return {
    response,
    session: {
      id: session.id,
      expiresAt: session.expiresAt,
    },
    sessionToken,
  };
}

export async function revokeLoginSession(sessionId: Uuid): Promise<void> {
  await revokeSessionById(sessionId);
}
