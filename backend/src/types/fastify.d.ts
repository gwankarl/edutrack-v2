import type { AuthenticatedUserContext } from '../modules/accounts/authenticated-user.js';

declare module 'fastify' {
  interface FastifyRequest {
    authenticatedUser?: AuthenticatedUserContext;
  }
}

export {};
