import {
  errorResponseSchema,
  type ErrorResponse,
  type ValidationDetail,
} from '@edutrack/contracts';
import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify';
import { AppError } from './app-error.js';
import { ERROR_CODES, type ErrorCode } from './error-codes.js';

const INTERNAL_ERROR_MESSAGE = 'An unexpected error occurred.';

function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: ErrorCode,
  message: string,
  details?: ValidationDetail[],
) {
  const payload: ErrorResponse = errorResponseSchema.parse({
    success: false,
    error: {
      code,
      message,
      ...(details && details.length > 0 ? { details } : {}),
    },
  });

  return reply.code(statusCode).send(payload);
}

function validationDetails(error: FastifyError): ValidationDetail[] {
  return (error.validation ?? []).map((issue) => ({
    path: issue.instancePath
      .split('/')
      .slice(1)
      .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~')),
    code: issue.keyword,
    message: issue.message ?? 'Invalid request value.',
  }));
}

function clientErrorForStatus(statusCode: number): {
  code: ErrorCode;
  message: string;
} {
  switch (statusCode) {
    case 400:
      return { code: ERROR_CODES.BAD_REQUEST, message: 'The request is invalid.' };
    case 401:
      return { code: ERROR_CODES.UNAUTHORIZED, message: 'Authentication is required.' };
    case 403:
      return { code: ERROR_CODES.FORBIDDEN, message: 'The request is not permitted.' };
    case 404:
      return { code: ERROR_CODES.NOT_FOUND, message: 'The requested resource was not found.' };
    case 409:
      return { code: ERROR_CODES.CONFLICT, message: 'The request conflicts with current state.' };
    case 413:
      return { code: ERROR_CODES.PAYLOAD_TOO_LARGE, message: 'The request payload is too large.' };
    case 415:
      return {
        code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
        message: 'The request content type is not supported.',
      };
    case 422:
      return {
        code: ERROR_CODES.UNPROCESSABLE_ENTITY,
        message: 'The request could not be processed.',
      };
    case 429:
      return {
        code: ERROR_CODES.TOO_MANY_REQUESTS,
        message: 'Too many requests.',
      };
    default:
      return { code: ERROR_CODES.REQUEST_ERROR, message: 'The request could not be completed.' };
  }
}

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error instanceof AppError) {
      return sendError(reply, error.statusCode, error.code, error.message, error.details);
    }

    if (error.validation !== undefined) {
      return sendError(
        reply,
        400,
        ERROR_CODES.VALIDATION_ERROR,
        'Request validation failed.',
        validationDetails(error),
      );
    }

    const statusCode = error.statusCode;
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      const mapped = clientErrorForStatus(statusCode);
      return sendError(reply, statusCode, mapped.code, mapped.message);
    }

    request.log.error({ errorName: error.name }, 'Unexpected server error');

    const safeStatusCode =
      statusCode !== undefined && statusCode >= 500 && statusCode < 600 ? statusCode : 500;

    return sendError(
      reply,
      safeStatusCode,
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      INTERNAL_ERROR_MESSAGE,
    );
  });

  // Fastify handles unmatched routes through setNotFoundHandler, not setErrorHandler.
  app.setNotFoundHandler((_request, reply) =>
    sendError(reply, 404, ERROR_CODES.NOT_FOUND, 'The requested resource was not found.'),
  );
}
