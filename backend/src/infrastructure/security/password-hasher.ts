import * as argon2 from 'argon2';

/**
 * OWASP baseline for Argon2id. Benchmark and tune these values for production
 * hardware and expected concurrent login load.
 */
export const PASSWORD_HASH_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
});

export async function hashPassword(plaintextPassword: string): Promise<string> {
  try {
    // Argon2 generates a fresh cryptographic salt and returns an encoded PHC hash.
    return await argon2.hash(plaintextPassword, PASSWORD_HASH_OPTIONS);
  } catch {
    // Do not propagate library details or the submitted password.
    throw new Error('Password hashing failed.');
  }
}

export async function verifyPassword(
  plaintextPassword: string,
  storedHash: string,
): Promise<boolean> {
  try {
    return await argon2.verify(storedHash, plaintextPassword);
  } catch {
    // Malformed hashes and verifier failures fail closed without exposing details.
    return false;
  }
}
