import { randomUUID } from 'node:crypto';
import type { FastifyServerOptions } from 'fastify';
import type { BackendEnvironment } from '../config/environment.js';

export function createFastifyOptions(environment: BackendEnvironment): FastifyServerOptions {
  const isDevelopment = environment.NODE_ENV === 'development';

  return {
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    logger: {
      level: isDevelopment ? 'debug' : 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["set-cookie"]',
          'req.headers["proxy-authorization"]',
          'req.headers["x-api-key"]',
          'req.headers["x-auth-token"]',
          'req.headers["x-csrf-token"]',
          'req.body',
          'req.url',
          'err.message',
          'err.stack',
          'err.cause',
        ],
        censor: '[REDACTED]',
      },
      serializers: {
        req(request) {
          return {
            id: request.id,
            method: request.method,
            route: request.routeOptions.url ?? '<unmatched>',
          };
        },
      },
      ...(isDevelopment
        ? {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
              },
            },
          }
        : {}),
    },
  };
}
