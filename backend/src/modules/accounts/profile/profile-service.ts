import {
  currentUserResponseSchema,
  updateProfileRequestSchema,
  type CurrentUserResponse,
  type UpdateProfileRequest,
  type Uuid,
} from '@edutrack/contracts';
import { AppError } from '../../../infrastructure/errors/app-error.js';
import { ERROR_CODES } from '../../../infrastructure/errors/error-codes.js';
import { findAccountWithRolesById } from '../account-repository.js';
import { updateProfile as updateProfileRecord } from './profile-repository.js';

function profileNotFoundError(): AppError {
  return new AppError(ERROR_CODES.NOT_FOUND, 404, 'The user profile was not found.');
}

export async function updateUserProfile(
  userId: Uuid,
  input: UpdateProfileRequest,
): Promise<CurrentUserResponse> {
  const request = updateProfileRequestSchema.parse(input);

  const updatedProfile = await updateProfileRecord(userId, request);
  if (!updatedProfile) {
    throw profileNotFoundError();
  }

  // Reuse the existing account lookup so roles come from trusted database rows.
  const account = await findAccountWithRolesById(userId);
  if (!account) {
    throw profileNotFoundError();
  }

  return currentUserResponseSchema.parse({
    success: true,
    data: account,
  });
}
