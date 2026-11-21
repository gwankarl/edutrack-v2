import { createHash, randomBytes } from 'node:crypto';

const SESSION_TOKEN_RANDOM_BYTES = 32;

export type RawSessionToken = string;
export type SessionTokenHash = string;

/**
 * Generates 256 bits of cryptographic randomness encoded as an unpadded,
 * cookie-safe base64url token.
 */
export function generateSessionToken(): RawSessionToken {
  return randomBytes(SESSION_TOKEN_RANDOM_BYTES).toString('base64url');
}

/**
 * Returns the lowercase hexadecimal SHA-256 digest used by the sessions table.
 * Store this digest; do not persist or log the raw token.
 */
export function hashSessionToken(token: RawSessionToken): SessionTokenHash {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isValidSessionToken(token: string): token is RawSessionToken {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
