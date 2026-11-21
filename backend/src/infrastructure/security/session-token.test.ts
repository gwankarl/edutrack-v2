import { describe, expect, it } from 'vitest';
import { generateSessionToken, hashSessionToken } from './session-token.js';

describe('session token utilities', () => {
  it('generates 256-bit tokens in cookie-safe base64url format', () => {
    const token = generateSessionToken();

    // 32 random bytes encode as 43 unpadded base64url characters.
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates distinct tokens across repeated calls', () => {
    const tokens = Array.from({ length: 32 }, () => generateSessionToken());

    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('returns a deterministic, lowercase hexadecimal SHA-256 digest', () => {
    const digest = hashSessionToken('abc');

    expect(digest).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken('abc')).toBe(digest);
  });

  it('returns different hashes for different tokens', () => {
    expect(hashSessionToken('first-token')).not.toBe(hashSessionToken('second-token'));
  });
});
