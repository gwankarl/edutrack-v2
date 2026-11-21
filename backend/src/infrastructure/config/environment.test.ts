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
      FRONTEND_ORIGIN: 'http://localhost:5173',
      SMTP_SECURE: false,
      SMTP_FROM_NAME: 'EduTrack',
    });
  });

  it('validates and converts configured values', () => {
    expect(
      parseEnvironment({
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '8080',
        DATABASE_URL: TEST_DATABASE_URL,
        FRONTEND_ORIGIN: 'https://edutrack.example.test',
        SMTP_HOST: 'smtp.example.test',
        SMTP_PORT: '587',
        SMTP_USER: 'smtp-user',
        SMTP_PASSWORD: 'smtp-password',
        SMTP_FROM_EMAIL: 'noreply@example.test',
      }),
    ).toEqual({
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      PORT: 8080,
      DATABASE_URL: TEST_DATABASE_URL,
      FRONTEND_ORIGIN: 'https://edutrack.example.test',
      SMTP_HOST: 'smtp.example.test',
      SMTP_PORT: 587,
      SMTP_USER: 'smtp-user',
      SMTP_PASSWORD: 'smtp-password',
      SMTP_FROM_EMAIL: 'noreply@example.test',
      SMTP_SECURE: false,
      SMTP_FROM_NAME: 'EduTrack',
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

  it('requires an explicit trusted frontend origin in production', () => {
    expect(() =>
      parseEnvironment({ NODE_ENV: 'production', DATABASE_URL: TEST_DATABASE_URL }),
    ).toThrow(/Invalid backend environment configuration:.*FRONTEND_ORIGIN/s);
  });

  it('accepts a complete SMTP configuration and normalizes values', () => {
    expect(
      parseEnvironment({
        DATABASE_URL: TEST_DATABASE_URL,
        SMTP_HOST: ' sandbox.smtp.mailtrap.io ',
        SMTP_PORT: '2525',
        SMTP_SECURE: 'false',
        SMTP_USER: 'sandbox-user',
        SMTP_PASSWORD: 'sandbox-password',
        SMTP_FROM_EMAIL: 'edutrack@example.test',
        SMTP_FROM_NAME: 'EduTrack Sandbox',
      }),
    ).toMatchObject({
      SMTP_HOST: 'sandbox.smtp.mailtrap.io',
      SMTP_PORT: 2525,
      SMTP_SECURE: false,
      SMTP_USER: 'sandbox-user',
      SMTP_FROM_EMAIL: 'edutrack@example.test',
      SMTP_FROM_NAME: 'EduTrack Sandbox',
    });
  });

  it('rejects incomplete SMTP configuration', () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL: TEST_DATABASE_URL,
        SMTP_HOST: 'sandbox.smtp.mailtrap.io',
        SMTP_PASSWORD: 'test-only-placeholder',
      }),
    ).toThrow(/SMTP_PORT: is required when SMTP is configured/);
  });

  it.each([
    'javascript:alert(1)',
    'https://user:password@example.test',
    'https://example.test/path',
    'https://example.test/?redirect=elsewhere',
  ])('rejects unsafe frontend origins (%s)', (origin) => {
    expect(() =>
      parseEnvironment({ DATABASE_URL: TEST_DATABASE_URL, FRONTEND_ORIGIN: origin }),
    ).toThrow(/FRONTEND_ORIGIN/);
  });

  it('requires HTTPS for a production frontend origin', () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: TEST_DATABASE_URL,
        FRONTEND_ORIGIN: 'http://edutrack.example.test',
      }),
    ).toThrow(/FRONTEND_ORIGIN: must use HTTPS in production/);
  });
});
