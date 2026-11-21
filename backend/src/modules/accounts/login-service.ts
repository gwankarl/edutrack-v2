import {
  loginRequestSchema,
  loginResponseSchema,
  type LoginRequest,
  type LoginResponse,
} from '@edutrack/contracts';
import { AppError } from '../../infrastructure/errors/app-error.js';
import { ERROR_CODES } from '../../infrastructure/errors/error-codes.js';
import { verifyPassword } from '../../infrastructure/security/password-hasher.js';
import { findAccountForAuthenticationByEmail } from './account-repository.js';

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';

function invalidCredentialsError(): AppError {
  return new AppError(ERROR_CODES.UNAUTHORIZED, 401, INVALID_CREDENTIALS_MESSAGE);
}

export async function loginAccount(input: LoginRequest): Promise<LoginResponse> {
  const request = loginRequestSchema.parse(input);
  const account = await findAccountForAuthenticationByEmail(request.email);

  if (!account) {
    throw invalidCredentialsError();
  }

  const passwordMatches = await verifyPassword(request.password, account.passwordHash);

  if (!passwordMatches) {
    throw invalidCredentialsError();
  }

  return loginResponseSchema.parse({
    success: true,
    data: {
      id: account.id,
      displayName: account.displayName,
      email: account.email,
    },
  });
}
