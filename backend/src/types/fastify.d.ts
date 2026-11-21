import type { AuthenticatedUserContext } from '../modules/accounts/authentication/authenticated-user.js';

declare module 'fastify' {
  interface FastifyRequest {
    authenticatedUser?: AuthenticatedUserContext;
  }
}

export {};
