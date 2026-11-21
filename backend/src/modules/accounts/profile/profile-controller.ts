import type { UpdateProfileRequest } from '@edutrack/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../../../infrastructure/errors/app-error.js';
import { ERROR_CODES } from '../../../infrastructure/errors/error-codes.js';
import { updateUserProfile } from './profile-service.js';

export async function updateProfileController(request: FastifyRequest, reply: FastifyReply) {
  const authenticatedUser = request.authenticatedUser;

  if (!authenticatedUser) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 401, 'Authentication is required.');
  }

  // The profile service applies the strict shared request schema before persistence.
  const input = request.body as UpdateProfileRequest;
  const response = await updateUserProfile(authenticatedUser.id, input);

  return reply.code(200).send(response);
}
