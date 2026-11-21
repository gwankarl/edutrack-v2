import {
  registrationRequestSchema,
  registrationResponseSchema,
  type RegistrationRequest,
  type RegistrationResponse,
} from '@edutrack/contracts';
import { AppError } from '../../infrastructure/errors/app-error.js';
import { ERROR_CODES } from '../../infrastructure/errors/error-codes.js';
import { getDatabaseClient } from '../../infrastructure/database/client.js';
import { hashPassword } from '../../infrastructure/security/password-hasher.js';
import { AccountEmailAlreadyExistsError } from './account-repository.errors.js';
import { assignStudentRole, createAccount } from './account-repository.js';

export async function registerStudent(input: RegistrationRequest): Promise<RegistrationResponse> {
  const request = registrationRequestSchema.parse(input);

  // Hash before opening a transaction so Argon2 work does not hold a DB transaction open.
  const passwordHash = await hashPassword(request.password);

  try {
    return await getDatabaseClient().transaction(async (transaction) => {
      const account = await createAccount(
        {
          displayName: request.displayName,
          email: request.email,
          passwordHash,
        },
        transaction,
      );

      await assignStudentRole(account.id, transaction);

      return registrationResponseSchema.parse({
        success: true,
        data: account,
      });
    });
  } catch (error) {
    if (error instanceof AccountEmailAlreadyExistsError) {
      throw new AppError(ERROR_CODES.CONFLICT, 409, 'An account with this email already exists.');
    }

    throw error;
  }
}
