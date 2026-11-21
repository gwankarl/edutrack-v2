import { createHash, randomBytes } from 'node:crypto';

const TOKEN_RANDOM_BYTES = 32;

export type RawSecurityToken = string;
export type SecurityTokenHash = string;

/** Generates 256 bits of cryptographic randomness as an unpadded base64url token. */
export function generateSecurityToken(): RawSecurityToken {
  return randomBytes(TOKEN_RANDOM_BYTES).toString('base64url');
}

/** Returns a lowercase hexadecimal SHA-256 hash suitable for the token_hash columns. */
export function hashSecurityToken(token: RawSecurityToken): SecurityTokenHash {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isValidSecurityToken(token: string): token is RawSecurityToken {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
