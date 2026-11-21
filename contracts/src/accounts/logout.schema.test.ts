import { describe, expect, it } from 'vitest';
import { logoutResponseSchema } from './logout.schema.js';

describe('logout response contract', () => {
  it('accepts the predictable successful logout response', () => {
    expect(
      logoutResponseSchema.safeParse({ success: true, data: { loggedOut: true } }).success,
    ).toBe(true);
  });

  it('rejects session details or other unexpected response fields', () => {
    expect(
      logoutResponseSchema.safeParse({
        success: true,
        data: { loggedOut: true, sessionId: 'internal' },
      }).success,
    ).toBe(false);
  });
});
