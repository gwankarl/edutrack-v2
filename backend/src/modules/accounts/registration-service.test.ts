import type { RegistrationRequest } from '@edutrack/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../infrastructure/errors/error-codes.js';

const mocks = vi.hoisted(() => ({
  getDatabaseClient: vi.fn(),
  hashPassword: vi.fn(),
  createAccount: vi.fn(),
  assignStudentRole: vi.fn(),
}));

vi.mock('../../infrastructure/database/client.js', () => ({
  getDatabaseClient: mocks.getDatabaseClient,
}));

vi.mock('../../infrastructure/security/password-hasher.js', () => ({
  hashPassword: mocks.hashPassword,
}));

vi.mock('./account-repository.js', () => ({
  createAccount: mocks.createAccount,
  assignStudentRole: mocks.assignStudentRole,
}));

import { registerStudent } from './registration-service.js';

const account = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  displayName: 'Sample Student',
  email: 'student@example.test',
};

describe('registration service', () => {
  let transactionHandle: object;
  let transaction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();

    transactionHandle = { transactionHandle: true };
    transaction = vi.fn(async (operation) => operation(transactionHandle));

    mocks.getDatabaseClient.mockReturnValue({ transaction });
    mocks.hashPassword.mockResolvedValue('$argon2id$synthetic-test-hash');
    mocks.createAccount.mockResolvedValue(account);
    mocks.assignStudentRole.mockResolvedValue(undefined);
  });

  it('normalizes input, hashes the password, creates the account, and assigns Student', async () => {
    const response = await registerStudent({
      displayName: '  Sample Student  ',
      email: ' STUDENT@Example.test ',
      password: 'a sufficiently long password',
    });

    expect(mocks.hashPassword).toHaveBeenCalledWith('a sufficiently long password');
    expect(transaction).toHaveBeenCalledOnce();
    expect(mocks.createAccount).toHaveBeenCalledWith(
      {
        displayName: 'Sample Student',
        email: 'student@example.test',
        passwordHash: '$argon2id$synthetic-test-hash',
      },
      transactionHandle,
    );
    expect(mocks.assignStudentRole).toHaveBeenCalledWith(account.id, transactionHandle);
    expect(response).toEqual({ success: true, data: account });
    expect(JSON.stringify(response)).not.toContain('$argon2id$');
    expect(JSON.stringify(response)).not.toContain('a sufficiently long password');
  });

  it.each(['teacher', 'administrator'] as const)(
    'rejects public input attempting to assign %s',
    async (role) => {
      const input = {
        displayName: 'Sample Student',
        email: 'student@example.test',
        password: 'a sufficiently long password',
        role,
      } as RegistrationRequest;

      await expect(registerStudent(input)).rejects.toHaveProperty('name', 'ZodError');

      expect(mocks.hashPassword).not.toHaveBeenCalled();
      expect(mocks.getDatabaseClient).not.toHaveBeenCalled();
      expect(mocks.createAccount).not.toHaveBeenCalled();
      expect(mocks.assignStudentRole).not.toHaveBeenCalled();
    },
  );

  it('maps the repository duplicate-email error to a conflict', async () => {
    const { AccountEmailAlreadyExistsError } = await import('./account-repository.errors.js');
    mocks.createAccount.mockRejectedValue(new AccountEmailAlreadyExistsError());

    await expect(
      registerStudent({
        displayName: 'Sample Student',
        email: 'student@example.test',
        password: 'a sufficiently long password',
      }),
    ).rejects.toMatchObject({
      name: 'AppError',
      code: ERROR_CODES.CONFLICT,
      statusCode: 409,
    });
  });

  it('does not open a transaction when password hashing fails', async () => {
    mocks.hashPassword.mockRejectedValue(new Error('Password hashing failed.'));

    await expect(
      registerStudent({
        displayName: 'Sample Student',
        email: 'student@example.test',
        password: 'a sufficiently long password',
      }),
    ).rejects.toBeInstanceOf(Error);

    expect(mocks.getDatabaseClient).not.toHaveBeenCalled();
    expect(mocks.createAccount).not.toHaveBeenCalled();
  });

  it('does not assign a role if account creation fails', async () => {
    mocks.createAccount.mockRejectedValue(new Error('Synthetic persistence failure.'));

    await expect(
      registerStudent({
        displayName: 'Sample Student',
        email: 'student@example.test',
        password: 'a sufficiently long password',
      }),
    ).rejects.toThrow('Synthetic persistence failure.');

    expect(mocks.assignStudentRole).not.toHaveBeenCalled();
  });

  it('propagates role assignment failure for transaction rollback at the database boundary', async () => {
    mocks.assignStudentRole.mockRejectedValue(new Error('Synthetic role assignment failure.'));

    await expect(
      registerStudent({
        displayName: 'Sample Student',
        email: 'student@example.test',
        password: 'a sufficiently long password',
      }),
    ).rejects.toThrow('Synthetic role assignment failure.');

    expect(mocks.createAccount).toHaveBeenCalledOnce();
    expect(mocks.assignStudentRole).toHaveBeenCalledOnce();
  });
});
