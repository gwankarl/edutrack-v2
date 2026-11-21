import {
  changePasswordRequestSchema,
  changePasswordResponseSchema,
  type ChangePasswordRequest,
  type ChangePasswordResponse,
  type Uuid,
} from '@edutrack/contracts';
import { AppError } from '../../infrastructure/errors/app-error.js';
import { ERROR_CODES } from '../../infrastructure/errors/error-codes.js';
import { hashPassword, verifyPassword } from '../../infrastructure/security/password-hasher.js';
import {
  changePasswordAndRevokeSessions,
  findPasswordChangeCredentials,
} from './password-change-repository.js';

function invalidCurrentPasswordError(): AppError {
  return new AppError(ERROR_CODES.UNAUTHORIZED, 401, 'The current password is incorrect.');
}

function unchangedPasswordError(): AppError {
  return new AppError(
    ERROR_CODES.BAD_REQUEST,
    400,
    'The new password must differ from the current password.',
  );
}

/** The user ID must come from the trusted authentication context. */
export async function changePassword(
  authenticatedUserId: Uuid,
  input: ChangePasswordRequest,
): Promise<ChangePasswordResponse> {
  const request = changePasswordRequestSchema.parse(input);
  const account = await findPasswordChangeCredentials(authenticatedUserId);

  if (!account || !(await verifyPassword(request.currentPassword, account.passwordHash))) {
    throw invalidCurrentPasswordError();
  }

  if (request.currentPassword === request.newPassword) {
    throw unchangedPasswordError();
  }

  // Keep Argon2 work outside the transaction; the repository's conditional
  // update rejects the operation if the verified hash is no longer current.
  const newPasswordHash = await hashPassword(request.newPassword);
  const changed = await changePasswordAndRevokeSessions(
    authenticatedUserId,
    account.passwordHash,
    newPasswordHash,
  );

  if (!changed) throw invalidCurrentPasswordError();

  return changePasswordResponseSchema.parse({
    success: true,
    data: { passwordChanged: true },
  });
}
