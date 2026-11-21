import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../config/environment.js';
import { createFastifyOptions } from './fastify-options.js';

const TEST_DATABASE_URL = 'postgresql://test:test@localhost:5432/edutrack_test';

describe('createFastifyOptions', () => {
  it('uses readable pretty logging in development', () => {
    const options = createFastifyOptions(
      parseEnvironment({ NODE_ENV: 'development', DATABASE_URL: TEST_DATABASE_URL }),
    );

    expect(options.logger).toMatchObject({
      level: 'debug',
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
      serializers: { req: expect.any(Function) },
    });
  });

  it('uses structured JSON logging outside development', () => {
    const options = createFastifyOptions(
      parseEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: TEST_DATABASE_URL,
        FRONTEND_ORIGIN: 'https://edutrack.example.test',
      }),
    );

    expect(options.logger).toMatchObject({
      level: 'info',
      serializers: { req: expect.any(Function) },
    });
    expect(options.logger).not.toHaveProperty('transport');
  });

  it('generates request IDs instead of trusting incoming headers', () => {
    const options = createFastifyOptions(
      parseEnvironment({ NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL }),
    );

    expect(options.requestIdHeader).toBe(false);
    expect(options.genReqId).toBeTypeOf('function');
  });

  it('configures redaction for credentials, request bodies, and exception details', () => {
    const options = createFastifyOptions(
      parseEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: TEST_DATABASE_URL,
        FRONTEND_ORIGIN: 'https://edutrack.example.test',
      }),
    );

    expect(options.logger).toMatchObject({
      redact: {
        paths: expect.arrayContaining([
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-api-key"]',
          'req.body',
          'err.message',
          'err.stack',
        ]),
      },
    });
  });
});
