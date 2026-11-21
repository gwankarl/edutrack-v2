import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app/create-app.js';
import { parseEnvironment } from '../config/environment.js';
import {
  AUTH_SESSION_COOKIE_NAME,
  clearAuthSessionCookie,
  readAuthSessionCookie,
  setAuthSessionCookie,
} from './auth-cookie.js';
import { generateSessionToken } from './session-token.js';

const TEST_DATABASE_URL = 'postgresql://test:test@localhost:5432/edutrack_dev';
const apps: ReturnType<typeof createApp>[] = [];

let observedToken: string | undefined;

function makeApp(nodeEnvironment: 'test' | 'production') {
  const environment = parseEnvironment({
    NODE_ENV: nodeEnvironment,
    DATABASE_URL: TEST_DATABASE_URL,
    ...(nodeEnvironment === 'production'
      ? { FRONTEND_ORIGIN: 'https://edutrack.example.test' }
      : {}),
  });
  const app = createApp(environment);

  app.get('/__test/cookie/set', (_request, reply) => {
    const expiresAt = new Date(Date.now() + 60_000);
    setAuthSessionCookie(reply, generateSessionToken(), expiresAt, environment);
    return { ok: true };
  });

  app.get('/__test/cookie/read', (request) => {
    observedToken = readAuthSessionCookie(request);
    return { ok: true };
  });

  app.get('/__test/cookie/clear', (_request, reply) => {
    clearAuthSessionCookie(reply, environment);
    return { ok: true };
  });

  apps.push(app);
  return app;
}

afterEach(async () => {
  observedToken = undefined;
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('authentication session cookie utilities', () => {
  it('sets an HttpOnly, SameSite=Lax development cookie bounded by session expiry', async () => {
    const app = makeApp('test');
    const response = await app.inject({
      method: 'GET',
      url: '/__test/cookie/set',
    });
    const cookie = String(response.headers['set-cookie']);
    const maxAge = Number(/Max-Age=(\d+)/i.exec(cookie)?.[1]);

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(AUTH_SESSION_COOKIE_NAME + '=');
    expect(cookie).toContain(`${AUTH_SESSION_COOKIE_NAME}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toMatch(/;\s*Secure(?:;|$)/i);
    expect(cookie).not.toMatch(/;\s*Domain=/i);
    expect(maxAge).toBeGreaterThan(0);
    expect(maxAge).toBeLessThanOrEqual(60);
  });

  it('sets Secure for production cookies', async () => {
    const app = makeApp('production');
    const response = await app.inject({
      method: 'GET',
      url: '/__test/cookie/set',
    });

    expect(String(response.headers['set-cookie'])).toMatch(/;\s*Secure(?:;|$)/i);
  });

  it('parses the session cookie without returning it in the response body', async () => {
    const app = makeApp('test');
    const token = generateSessionToken();
    const response = await app.inject({
      method: 'GET',
      url: '/__test/cookie/read',
      headers: {
        cookie: `${AUTH_SESSION_COOKIE_NAME}=${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(observedToken).toBe(token);
    expect(response.body).not.toContain(token);
  });

  it('clears the cookie using the same path and security attributes', async () => {
    const app = makeApp('production');
    const response = await app.inject({
      method: 'GET',
      url: '/__test/cookie/clear',
    });
    const cookie = String(response.headers['set-cookie']);

    expect(response.statusCode).toBe(200);
    expect(cookie).toContain(`${AUTH_SESSION_COOKIE_NAME}=`);
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toMatch(/;\s*Secure(?:;|$)/i);
  });
});
