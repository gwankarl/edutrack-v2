import type { FastifyRequest } from 'fastify';
import { AppError } from '../errors/app-error.js';
import { ERROR_CODES } from '../errors/error-codes.js';

export function requireTrustedOrigin(frontendOrigin: string) {
  const trustedOrigin = new URL(frontendOrigin).origin;

  return async function checkOrigin(request: FastifyRequest): Promise<void> {
    const origin = request.headers.origin;
    const fetchSite = request.headers['sec-fetch-site'];

    if (
      typeof origin !== 'string' ||
      origin === 'null' ||
      origin !== trustedOrigin ||
      fetchSite === 'cross-site'
    ) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 403, 'Request origin is not allowed.');
    }
  };
}
