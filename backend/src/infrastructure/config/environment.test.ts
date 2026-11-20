import { describe, expect, it } from 'vitest';
import { parseEnvironment } from './environment.js';

const TEST_DATABASE_URL = 'postgresql://test:test@localhost:5432/edutrack_test';

describe('parseEnvironment', () => {
  it('uses local defaults for mode, host, and port', () => {
    expect(parseEnvironment({ DATABASE_URL: TEST_DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      DATABASE_URL: TEST_DATABASE_URL,
    });
  });

  it('validates and converts configured values', () => {
    expect(
      parseEnvironment({
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '8080',
        DATABASE_URL: TEST_DATABASE_URL,
      }),
    ).toEqual({
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      PORT: 8080,
      DATABASE_URL: TEST_DATABASE_URL,
    });
  });

  it('rejects an unsupported environment name', () => {
    expect(() =>
      parseEnvironment({ NODE_ENV: 'staging', DATABASE_URL: TEST_DATABASE_URL }),
    ).toThrow(/Invalid backend environment configuration:.*NODE_ENV/s);
  });

  it('rejects an invalid port', () => {
    expect(() => parseEnvironment({ PORT: 'not-a-port', DATABASE_URL: TEST_DATABASE_URL })).toThrow(
      /Invalid backend environment configuration:.*PORT/s,
    );
  });

  it('rejects an empty host', () => {
    expect(() => parseEnvironment({ HOST: '   ', DATABASE_URL: TEST_DATABASE_URL })).toThrow(
      /Invalid backend environment configuration:.*HOST/s,
    );
  });

  it('rejects a non-PostgreSQL database URL', () => {
    expect(() =>
      parseEnvironment({ DATABASE_URL: 'mysql://test:test@localhost:3306/edutrack_test' }),
    ).toThrow(/Invalid backend environment configuration:.*DATABASE_URL/s);
  });

  it('requires a database URL', () => {
    expect(() => parseEnvironment({})).toThrow(
      /Invalid backend environment configuration:.*DATABASE_URL/s,
    );
  });
});
