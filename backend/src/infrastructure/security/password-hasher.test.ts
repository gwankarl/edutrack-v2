import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password-hasher.js';

describe('password hashing', () => {
  it('creates an Argon2id encoded hash and verifies the correct password', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(hash).toMatch(/^\$argon2id\$v=19\$/);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('returns false for an incorrect password', async () => {
    const hash = await hashPassword('correct horse battery staple');

    await expect(verifyPassword('incorrect password', hash)).resolves.toBe(false);
  });

  it.each(['', 'not-a-phc-hash', '$argon2id$malformed'])(
    'returns false for a malformed stored hash: %s',
    async (storedHash) => {
      await expect(verifyPassword('any password', storedHash)).resolves.toBe(false);
    },
  );

  it('uses unique salts for identical passwords', async () => {
    const firstHash = await hashPassword('same password');
    const secondHash = await hashPassword('same password');

    expect(firstHash).not.toBe(secondHash);
    await expect(verifyPassword('same password', firstHash)).resolves.toBe(true);
    await expect(verifyPassword('same password', secondHash)).resolves.toBe(true);
  });
});
