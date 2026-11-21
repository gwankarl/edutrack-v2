import { beforeEach, describe, expect, it, vi } from 'vitest';
import { passwordResetTokens } from '../../infrastructure/database/schema/accounts/password-reset-tokens.table.js';
import { sessions } from '../../infrastructure/database/schema/accounts/sessions.table.js';
import { users } from '../../infrastructure/database/schema/accounts/users.table.js';

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock('../../infrastructure/database/client.js', () => ({
  getDatabaseClient: () => ({ transaction: mocks.transaction }),
}));

import { resetPasswordWithToken } from './password-reset-token-repository.js';

function makeQueryBuilder(result: unknown, terminalError?: Error) {
  const builder: Record<string, unknown> = {};
  const resolve = () => (terminalError ? Promise.reject(terminalError) : Promise.resolve(result));

  for (const method of ['from', 'where', 'set', 'orderBy']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.limit = vi.fn(resolve);
  builder.for = vi.fn(resolve);
  builder.returning = vi.fn(resolve);
  builder.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected: (error: unknown) => unknown,
  ) => resolve().then(onFulfilled, onRejected);

  return builder;
}

describe('password reset transaction boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('rolls back the token and password changes if session revocation fails', async () => {
    let rolledBack = false;
    let resetTokenUpdateCount = 0;
    const injectedFailure = new Error('session update failed');
    const transaction = {
      select: vi
        .fn()
        .mockReturnValueOnce(makeQueryBuilder([{ id: 'token-id', userId: 'user-id' }]))
        .mockReturnValueOnce(makeQueryBuilder([{ id: 'user-id' }])),
      update: vi.fn((table: unknown) => {
        if (table === passwordResetTokens) {
          resetTokenUpdateCount += 1;
          return makeQueryBuilder(resetTokenUpdateCount === 1 ? [{ userId: 'user-id' }] : []);
        }
        return makeQueryBuilder([], table === sessions ? injectedFailure : undefined);
      }),
    };

    mocks.transaction.mockImplementation(async (operation) => {
      try {
        return await operation(transaction);
      } catch (error) {
        rolledBack = true;
        throw error;
      }
    });

    await expect(resetPasswordWithToken('a'.repeat(64), '$argon2id$test-hash')).rejects.toBe(
      injectedFailure,
    );

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(transaction.update).toHaveBeenCalledWith(passwordResetTokens);
    expect(transaction.update).toHaveBeenCalledWith(users);
    expect(transaction.update).toHaveBeenCalledWith(sessions);
    expect(rolledBack).toBe(true);
  });
});
