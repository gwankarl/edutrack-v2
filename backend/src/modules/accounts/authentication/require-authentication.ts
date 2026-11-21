import type { FastifyRequest } from 'fastify';
import { readAuthSessionCookie } from '../../../infrastructure/security/auth-cookie.js';
import { authenticateSessionToken } from './session-authentication.service.js';

export async function requireAuthentication(request: FastifyRequest): Promise<void> {
  request.authenticatedUser = await authenticateSessionToken(readAuthSessionCookie(request));
}
