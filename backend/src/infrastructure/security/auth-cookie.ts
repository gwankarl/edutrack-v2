import type { FastifyReply, FastifyRequest } from 'fastify';
import type { BackendEnvironment } from '../config/environment.js';
import type { RawSessionToken } from './session-token.js';

export const AUTH_SESSION_COOKIE_NAME = 'edutrack_session';

const COOKIE_PATH = '/';
const COOKIE_SAME_SITE = 'lax' as const;

type CookieEnvironment = Pick<BackendEnvironment, 'NODE_ENV'>;

function baseCookieOptions(environment: CookieEnvironment) {
  return {
    httpOnly: true,
    path: COOKIE_PATH,
    sameSite: COOKIE_SAME_SITE,
    secure: environment.NODE_ENV === 'production',
  };
}

function remainingLifetimeSeconds(expiresAt: Date): number {
  const remainingMilliseconds = expiresAt.getTime() - Date.now();

  if (!Number.isFinite(remainingMilliseconds) || remainingMilliseconds <= 0) {
    throw new RangeError('Session expiration must be a valid future date.');
  }

  // Floor the remaining time so Max-Age cannot extend past the server session.
  return Math.floor(remainingMilliseconds / 1000);
}

export function setAuthSessionCookie(
  reply: FastifyReply,
  token: RawSessionToken,
  sessionExpiresAt: Date,
  environment: CookieEnvironment,
): void {
  reply.setCookie(AUTH_SESSION_COOKIE_NAME, token, {
    ...baseCookieOptions(environment),
    expires: sessionExpiresAt,
    maxAge: remainingLifetimeSeconds(sessionExpiresAt),
  });
}

export function readAuthSessionCookie(request: FastifyRequest): RawSessionToken | undefined {
  return request.cookies[AUTH_SESSION_COOKIE_NAME];
}

export function clearAuthSessionCookie(reply: FastifyReply, environment: CookieEnvironment): void {
  reply.clearCookie(AUTH_SESSION_COOKIE_NAME, baseCookieOptions(environment));
}
