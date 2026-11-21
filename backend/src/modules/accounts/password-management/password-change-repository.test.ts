import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sessions } from '../../../infrastructure/database/schema/accounts/sessions.table.js';
import { users } from '../../../infrastructure/database/schema/accounts/users.table.js';

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock('../../../infrastructure/database/client.js', () => ({
  getDatabaseClient: () => ({ transaction: mocks.transaction }),
}));

import { changePasswordAndRevokeSessions } from './password-change-repository.js';

function makeBuilder(result: unknown, error?: Error) {
  const builder: Record<string, unknown> = {};
  const resolve = () => (error ? Promise.reject(error) : Promise.resolve(result));

  builder.set = vi.fn(() => builder);
  builder.where = vi.fn(() => builder);
  builder.returning = vi.fn(resolve);
  builder.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected: (reason: unknown) => unknown,
  ) => resolve().then(onFulfilled, onRejected);

  return builder;
}

describe('password-change repository transaction', () => {
  beforeEach(() => vi.resetAllMocks());

  it('rolls back the password update if session revocation fails', async () => {
    const injectedFailure = new Error('session revocation failure');
    let rolledBack = false;
    const transaction = {
      update: vi.fn((table: unknown) =>
        makeBuilder(
          table === users ? [{ id: 'user-id' }] : [],
          table === sessions ? injectedFailure : undefined,
        ),
      ),
    };

    mocks.transaction.mockImplementation(async (operation) => {
      try {
        return await operation(transaction);
      } catch (error) {
        rolledBack = true;
        throw error;
      }
    });

    await expect(
      changePasswordAndRevokeSessions(
        '550e8400-e29b-41d4-a716-446655440000',
        '$argon2id$old',
        '$argon2id$new',
      ),
    ).rejects.toBe(injectedFailure);

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(transaction.update).toHaveBeenCalledWith(users);
    expect(transaction.update).toHaveBeenCalledWith(sessions);
    expect(rolledBack).toBe(true);
  });

  it('does not revoke sessions if the expected hash is no longer current', async () => {
    const transaction = {
      update: vi.fn(() => makeBuilder([])),
    };
    mocks.transaction.mockImplementation((operation) => operation(transaction));

    await expect(
      changePasswordAndRevokeSessions(
        '550e8400-e29b-41d4-a716-446655440000',
        '$argon2id$stale',
        '$argon2id$new',
      ),
    ).resolves.toBe(false);

    expect(transaction.update).toHaveBeenCalledOnce();
    expect(transaction.update).toHaveBeenCalledWith(users);
  });
});
