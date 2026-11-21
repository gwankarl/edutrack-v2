import { loginRequestSchema, registrationRequestSchema } from '@edutrack/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { BackendEnvironment } from '../../infrastructure/config/environment.js';
import { setAuthSessionCookie } from '../../infrastructure/security/auth-cookie.js';
import { loginAccount, revokeLoginSession } from './login-service.js';
import { registerStudent } from './registration-service.js';

export async function registerAccountController(request: FastifyRequest, reply: FastifyReply) {
  const input = registrationRequestSchema.parse(request.body);
  const response = await registerStudent(input);

  return reply.code(201).send(response);
}

export async function loginAccountController(
  request: FastifyRequest,
  reply: FastifyReply,
  environment: Pick<BackendEnvironment, 'NODE_ENV'>,
) {
  const input = loginRequestSchema.parse(request.body);
  const result = await loginAccount(input);

  try {
    setAuthSessionCookie(reply, result.sessionToken, result.session.expiresAt, environment);
  } catch (cookieError) {
    try {
      await revokeLoginSession(result.session.id);
    } catch (cleanupError) {
      const errorName = cleanupError instanceof Error ? cleanupError.name : 'UnknownError';
      request.log.error({ errorName }, 'Could not revoke login session after cookie setup failure');
    }

    throw cookieError;
  }

  return reply.code(200).send(result.response);
}
