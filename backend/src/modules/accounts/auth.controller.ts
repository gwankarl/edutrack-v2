import {
  changePasswordRequestSchema,
  completePasswordResetRequestSchema,
  confirmEmailVerificationRequestSchema,
  loginRequestSchema,
  registrationRequestSchema,
  requestEmailVerificationRequestSchema,
  requestPasswordResetRequestSchema,
} from '@edutrack/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { BackendEnvironment } from '../../infrastructure/config/environment.js';
import { AppError } from '../../infrastructure/errors/app-error.js';
import { ERROR_CODES } from '../../infrastructure/errors/error-codes.js';
import {
  clearAuthSessionCookie,
  setAuthSessionCookie,
} from '../../infrastructure/security/auth-cookie.js';
import type { RegistrationVerificationDelivery } from './registration-service.js';
import type { createEmailVerificationWorkflow } from './email-verification-workflow-service.js';
import type { createPasswordResetWorkflow } from './password-reset-workflow-service.js';
import { loginAccount, revokeLoginSession } from './login-service.js';
import { registerStudent } from './registration-service.js';
import { changePassword } from './password-change-service.js';

type VerificationWorkflow = ReturnType<typeof createEmailVerificationWorkflow>;
type PasswordResetWorkflow = ReturnType<typeof createPasswordResetWorkflow>;

export async function registerAccountController(
  request: FastifyRequest,
  reply: FastifyReply,
  verificationDelivery: RegistrationVerificationDelivery,
) {
  const input = registrationRequestSchema.parse(request.body);
  const response = await registerStudent(input, verificationDelivery);

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

export async function requestEmailVerificationController(
  request: FastifyRequest,
  reply: FastifyReply,
  workflow: VerificationWorkflow,
) {
  const input = requestEmailVerificationRequestSchema.parse(request.body);
  const response = await workflow.requestVerification(input);

  return reply.code(200).send(response);
}

export async function confirmEmailVerificationController(
  request: FastifyRequest,
  reply: FastifyReply,
  workflow: VerificationWorkflow,
) {
  const input = confirmEmailVerificationRequestSchema.parse(request.body);
  const response = await workflow.confirmVerification(input);

  return reply.code(200).send(response);
}

export async function requestPasswordResetController(
  request: FastifyRequest,
  reply: FastifyReply,
  workflow: PasswordResetWorkflow,
) {
  const input = requestPasswordResetRequestSchema.parse(request.body);
  const response = await workflow.requestReset(input);

  return reply.code(200).send(response);
}

export async function completePasswordResetController(
  request: FastifyRequest,
  reply: FastifyReply,
  workflow: PasswordResetWorkflow,
) {
  const input = completePasswordResetRequestSchema.parse(request.body);
  const response = await workflow.completeReset(input);

  return reply.code(200).send(response);
}

export async function changePasswordController(
  request: FastifyRequest,
  reply: FastifyReply,
  environment: Pick<BackendEnvironment, 'NODE_ENV'>,
) {
  const authenticatedUser = request.authenticatedUser;

  if (!authenticatedUser) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 401, 'Authentication is required.');
  }

  const input = changePasswordRequestSchema.parse(request.body);
  const response = await changePassword(authenticatedUser.id, input);

  clearAuthSessionCookie(reply, environment);

  return reply.code(200).send(response);
}
