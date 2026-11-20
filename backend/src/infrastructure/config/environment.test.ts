import { describe, expect, it } from 'vitest';
import { parseEnvironment } from './environment.js';

describe('parseEnvironment', () => {
  it('uses local defaults when values are omitted', () => {
    expect(parseEnvironment({})).toEqual({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
    });
  });

  it('validates and converts configured values', () => {
    expect(
      parseEnvironment({
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '8080',
      }),
    ).toEqual({
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      PORT: 8080,
    });
  });

  it('rejects an unsupported environment name', () => {
    expect(() => parseEnvironment({ NODE_ENV: 'staging' })).toThrow(
      /Invalid backend environment configuration:.*NODE_ENV/s,
    );
  });

  it('rejects an invalid port', () => {
    expect(() => parseEnvironment({ PORT: 'not-a-port' })).toThrow(
      /Invalid backend environment configuration:.*PORT/s,
    );
  });

  it('rejects an empty host', () => {
    expect(() => parseEnvironment({ HOST: '   ' })).toThrow(
      /Invalid backend environment configuration:.*HOST/s,
    );
  });
});
