import { logoutResponseSchema } from '@edutrack/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { BackendEnvironment } from '../../infrastructure/config/environment.js';
import {
  clearAuthSessionCookie,
  readAuthSessionCookie,
} from '../../infrastructure/security/auth-cookie.js';
import { logoutSession } from './logout.service.js';

export async function logoutController(
  request: FastifyRequest,
  reply: FastifyReply,
  environment: Pick<BackendEnvironment, 'NODE_ENV'>,
) {
  await logoutSession(readAuthSessionCookie(request));
  clearAuthSessionCookie(reply, environment);

  return reply.code(200).send(
    logoutResponseSchema.parse({
      success: true,
      data: { loggedOut: true },
    }),
  );
}
