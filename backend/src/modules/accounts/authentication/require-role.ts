import type { AccountRole } from '@edutrack/contracts';
import type { FastifyRequest } from 'fastify';
import { AppError } from '../../../infrastructure/errors/app-error.js';
import { ERROR_CODES } from '../../../infrastructure/errors/error-codes.js';

function unauthorizedError(): AppError {
  return new AppError(ERROR_CODES.UNAUTHORIZED, 401, 'Authentication is required.');
}

function forbiddenError(): AppError {
  return new AppError(ERROR_CODES.FORBIDDEN, 403, 'The request is not permitted.');
}

export function requireRole(requiredRole: AccountRole, ...additionalRoles: AccountRole[]) {
  const permittedRoles = [requiredRole, ...additionalRoles];

  return async function authorizeRole(request: FastifyRequest): Promise<void> {
    const authenticatedUser = request.authenticatedUser;

    if (!authenticatedUser) {
      throw unauthorizedError();
    }

    const hasPermittedRole = permittedRoles.some((role) => authenticatedUser.roles.includes(role));

    if (!hasPermittedRole) {
      throw forbiddenError();
    }
  };
}
