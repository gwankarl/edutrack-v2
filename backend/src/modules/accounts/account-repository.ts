import { accountEmailSchema, accountRoleSchema } from '@edutrack/contracts';
import { eq, sql } from 'drizzle-orm';
import type { AccountRole, Uuid } from '@edutrack/contracts';
import { getDatabaseClient } from '../../infrastructure/database/client.js';
import { userRoles } from '../../infrastructure/database/schema/accounts/user-roles.table.js';
import { users } from '../../infrastructure/database/schema/accounts/users.table.js';
import { AccountEmailAlreadyExistsError } from './account-repository.errors.js';

export type CreateAccountInput = Pick<
  typeof users.$inferInsert,
  'displayName' | 'email' | 'passwordHash'
>;

export type PublicAccountRecord = Pick<typeof users.$inferSelect, 'id' | 'displayName' | 'email'>;

export type AuthenticationAccountRecord = typeof users.$inferSelect;
export type AccountForVerificationRecord = Pick<
  typeof users.$inferSelect,
  'id' | 'displayName' | 'email' | 'emailVerifiedAt'
>;
export type AccountForPasswordResetRecord = Pick<
  typeof users.$inferSelect,
  'id' | 'displayName' | 'email'
>;
export type AccountWithRolesRecord = Pick<
  AuthenticationAccountRecord,
  'id' | 'displayName' | 'email'
> & {
  roles: AccountRole[];
};

/**
 * Only exposes the operation needed by this repository, so the existing
 * database client and a Drizzle transaction can both be used here.
 */
export type AccountDatabaseExecutor = Pick<ReturnType<typeof getDatabaseClient>, 'insert'>;

function normalizeEmail(email: string): string {
  return accountEmailSchema.parse(email);
}

function isEmailUniqueViolation(error: unknown): boolean {
  const visited = new Set<object>();
  let current: unknown = error;

  // Drizzle wraps driver errors in DrizzleQueryError, so inspect the cause chain
  // to translate only the named email constraint and leave other DB failures intact.
  while (typeof current === 'object' && current !== null && !visited.has(current)) {
    visited.add(current);
    const databaseError = current as { code?: unknown; constraint?: unknown; cause?: unknown };

    if (databaseError.code === '23505' && databaseError.constraint === 'users_email_lower_unique') {
      return true;
    }

    current = databaseError.cause;
  }

  return false;
}

export async function createAccount(
  input: CreateAccountInput,
  executor: AccountDatabaseExecutor = getDatabaseClient(),
): Promise<PublicAccountRecord> {
  const email = normalizeEmail(input.email);

  let account: PublicAccountRecord | undefined;

  try {
    [account] = await executor
      .insert(users)
      .values({ ...input, email })
      .returning({
        id: users.id,
        displayName: users.displayName,
        email: users.email,
      });
  } catch (error) {
    if (isEmailUniqueViolation(error)) {
      throw new AccountEmailAlreadyExistsError();
    }

    throw error;
  }

  if (!account) {
    throw new Error('Account creation did not return a record.');
  }

  return account;
}

export async function assignStudentRole(
  accountId: Uuid,
  executor: AccountDatabaseExecutor = getDatabaseClient(),
): Promise<void> {
  await executor.insert(userRoles).values({
    userId: accountId,
    role: 'student',
  });
}

export async function findAccountById(id: Uuid): Promise<PublicAccountRecord | undefined> {
  const [account] = await getDatabaseClient()
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return account;
}

/** Returns only public account fields and roles loaded from trusted database records. */
export async function findAccountWithRolesById(
  id: Uuid,
): Promise<AccountWithRolesRecord | undefined> {
  const rows = await getDatabaseClient()
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      role: userRoles.role,
    })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .where(eq(users.id, id));

  const first = rows[0];
  if (!first) return undefined;

  return {
    id: first.id,
    displayName: first.displayName,
    email: first.email,
    roles: rows.flatMap((row) => (row.role === null ? [] : [accountRoleSchema.parse(row.role)])),
  };
}

export async function findAccountForAuthenticationByEmail(
  email: string,
): Promise<AuthenticationAccountRecord | undefined> {
  const normalizedEmail = normalizeEmail(email);

  const [account] = await getDatabaseClient()
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalizedEmail}`)
    .limit(1);

  return account;
}

/** Returns only the data required to deliver verification mail. */
export async function findAccountForVerificationByEmail(
  email: string,
): Promise<AccountForVerificationRecord | undefined> {
  const normalizedEmail = normalizeEmail(email);
  const [account] = await getDatabaseClient()
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(sql`lower(${users.email}) = ${normalizedEmail}`)
    .limit(1);

  return account;
}

/** Returns only the fields needed to deliver a password-reset message. */
export async function findAccountForPasswordResetByEmail(
  email: string,
): Promise<AccountForPasswordResetRecord | undefined> {
  const normalizedEmail = normalizeEmail(email);
  const [account] = await getDatabaseClient()
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
    })
    .from(users)
    .where(sql`lower(${users.email}) = ${normalizedEmail}`)
    .limit(1);

  return account;
}
