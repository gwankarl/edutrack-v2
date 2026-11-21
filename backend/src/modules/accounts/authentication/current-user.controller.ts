import { currentUserResponseSchema } from '@edutrack/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../../../infrastructure/errors/app-error.js';
import { ERROR_CODES } from '../../../infrastructure/errors/error-codes.js';

export function getCurrentUserController(request: FastifyRequest, reply: FastifyReply) {
  const user = request.authenticatedUser;

  // This guard protects against accidental use of the controller without its route hook.
  if (!user) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 401, 'Authentication is required.');
  }

  const response = currentUserResponseSchema.parse({
    success: true,
    data: {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      roles: user.roles,
    },
  });

  return reply.code(200).send(response);
}
