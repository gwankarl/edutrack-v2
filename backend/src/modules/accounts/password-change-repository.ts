import { and, eq } from 'drizzle-orm';
import type { Uuid } from '@edutrack/contracts';
import { getDatabaseClient } from '../../infrastructure/database/client.js';
import { users } from '../../infrastructure/database/schema/accounts/users.table.js';
import { revokeAllSessionsForUser } from './session-repository.js';

export type PasswordChangeCredentials = Pick<typeof users.$inferSelect, 'passwordHash'>;

export async function findPasswordChangeCredentials(
  userId: Uuid,
): Promise<PasswordChangeCredentials | undefined> {
  const [account] = await getDatabaseClient()
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return account;
}

/**
 * The expected old hash provides compare-and-swap concurrency control. Password
 * persistence and session revocation commit or roll back as one transaction.
 */
export async function changePasswordAndRevokeSessions(
  userId: Uuid,
  verifiedPasswordHash: string,
  newPasswordHash: string,
  now = new Date(),
): Promise<boolean> {
  return getDatabaseClient().transaction(async (transaction) => {
    const [updatedAccount] = await transaction
      .update(users)
      .set({ passwordHash: newPasswordHash, updatedAt: now })
      .where(and(eq(users.id, userId), eq(users.passwordHash, verifiedPasswordHash)))
      .returning({ id: users.id });

    if (!updatedAccount) return false;

    await revokeAllSessionsForUser(userId, transaction);
    return true;
  });
}
