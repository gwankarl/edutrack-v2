import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateSessionToken,
  hashSessionToken,
} from '../../infrastructure/security/session-token.js';

const mocks = vi.hoisted(() => ({ revokeSessionByTokenHash: vi.fn() }));

vi.mock('./session-repository.js', () => ({
  revokeSessionByTokenHash: mocks.revokeSessionByTokenHash,
}));

describe('logout service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('revokes the session using only the hash of a valid cookie token', async () => {
    const token = generateSessionToken();
    const { logoutSession } = await import('./logout.service.js');

    await logoutSession(token);

    expect(mocks.revokeSessionByTokenHash).toHaveBeenCalledWith(hashSessionToken(token));
    expect(mocks.revokeSessionByTokenHash).not.toHaveBeenCalledWith(token);
  });

  it.each([undefined, '', 'malformed-token'])(
    'ignores missing or malformed cookies (%s)',
    async (token) => {
      const { logoutSession } = await import('./logout.service.js');

      await expect(logoutSession(token)).resolves.toBeUndefined();
      expect(mocks.revokeSessionByTokenHash).not.toHaveBeenCalled();
    },
  );

  it('treats an already revoked or unknown session as successful', async () => {
    mocks.revokeSessionByTokenHash.mockResolvedValue(false);
    const { logoutSession } = await import('./logout.service.js');

    await expect(logoutSession(generateSessionToken())).resolves.toBeUndefined();
  });

  it('propagates persistence errors without adding token details', async () => {
    mocks.revokeSessionByTokenHash.mockRejectedValue(new Error('database unavailable'));
    const token = generateSessionToken();
    const { logoutSession } = await import('./logout.service.js');

    await expect(logoutSession(token)).rejects.toThrow('database unavailable');
    expect(mocks.revokeSessionByTokenHash).toHaveBeenCalledWith(hashSessionToken(token));
  });
});
