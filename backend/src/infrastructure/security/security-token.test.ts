import { describe, expect, it } from 'vitest';
import {
  generateSecurityToken,
  hashSecurityToken,
  isValidSecurityToken,
} from './security-token.js';

describe('account security token utilities', () => {
  it('generates distinct 256-bit base64url tokens', () => {
    const tokens = Array.from({ length: 32 }, () => generateSecurityToken());

    expect(new Set(tokens).size).toBe(tokens.length);
    for (const token of tokens) {
      expect(token).toHaveLength(43);
      expect(isValidSecurityToken(token)).toBe(true);
    }
  });

  it('hashes deterministically to lowercase SHA-256 hex', () => {
    const hash = hashSecurityToken('abc');

    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashSecurityToken('abc')).toBe(hash);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects values outside the opaque token format', () => {
    expect(isValidSecurityToken('short')).toBe(false);
    expect(isValidSecurityToken('x'.repeat(43) + '!')).toBe(false);
  });
});
