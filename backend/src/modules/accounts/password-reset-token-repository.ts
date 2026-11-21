import { and, desc, eq, gt, gte, isNull } from 'drizzle-orm';
import type { Uuid } from '@edutrack/contracts';
import { getDatabaseClient } from '../../infrastructure/database/client.js';
import { passwordResetTokens } from '../../infrastructure/database/schema/accounts/password-reset-tokens.table.js';
import { users } from '../../infrastructure/database/schema/accounts/users.table.js';
import {
  PASSWORD_RESET_MAX_ISSUANCES_PER_DAY,
  PASSWORD_RESET_RESEND_COOLDOWN_MS,
} from '../../infrastructure/security/account-token-policy.js';
import type { SecurityTokenHash } from '../../infrastructure/security/security-token.js';
import { PasswordResetIssuanceLimitError } from './account-repository.errors.js';
import { revokeAllSessionsForUser } from './session-repository.js';

export type PasswordResetTokenMetadata = Pick<
  typeof passwordResetTokens.$inferSelect,
  'id' | 'userId' | 'createdAt' | 'expiresAt' | 'consumedAt'
>;

export type IssuePasswordResetTokenInput = {
  userId: Uuid;
  tokenHash: SecurityTokenHash;
  createdAt: Date;
  expiresAt: Date;
};

const metadataColumns = {
  id: passwordResetTokens.id,
  userId: passwordResetTokens.userId,
  createdAt: passwordResetTokens.createdAt,
  expiresAt: passwordResetTokens.expiresAt,
  consumedAt: passwordResetTokens.consumedAt,
};

export async function issuePasswordResetToken(
  input: IssuePasswordResetTokenInput,
): Promise<PasswordResetTokenMetadata> {
  return getDatabaseClient().transaction(async (transaction) => {
    const [user] = await transaction
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, input.userId))
      .for('update');

    if (!user) {
      throw new Error('Cannot issue a password reset token for a missing account.');
    }

    const dayAgo = new Date(input.createdAt.getTime() - 24 * 60 * 60 * 1000);
    const recentIssuances = await transaction
      .select({ createdAt: passwordResetTokens.createdAt })
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, input.userId),
          gte(passwordResetTokens.createdAt, dayAgo),
        ),
      )
      .orderBy(desc(passwordResetTokens.createdAt))
      .limit(PASSWORD_RESET_MAX_ISSUANCES_PER_DAY);

    if (
      recentIssuances.length >= PASSWORD_RESET_MAX_ISSUANCES_PER_DAY ||
      (recentIssuances[0] &&
        input.createdAt.getTime() - recentIssuances[0].createdAt.getTime() <
          PASSWORD_RESET_RESEND_COOLDOWN_MS)
    ) {
      throw new PasswordResetIssuanceLimitError();
    }

    await transaction
      .update(passwordResetTokens)
      .set({ consumedAt: input.createdAt })
      .where(
        and(eq(passwordResetTokens.userId, input.userId), isNull(passwordResetTokens.consumedAt)),
      );

    const [token] = await transaction
      .insert(passwordResetTokens)
      .values(input)
      .returning(metadataColumns);

    if (!token) {
      throw new Error('Password reset token creation did not return a record.');
    }

    return token;
  });
}

export async function findActivePasswordResetToken(
  tokenHash: SecurityTokenHash,
  now = new Date(),
): Promise<PasswordResetTokenMetadata | undefined> {
  const [token] = await getDatabaseClient()
    .select(metadataColumns)
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.consumedAt),
        gt(passwordResetTokens.expiresAt, now),
      ),
    )
    .limit(1);

  return token;
}

export async function consumePasswordResetToken(
  tokenHash: SecurityTokenHash,
  now = new Date(),
): Promise<PasswordResetTokenMetadata | undefined> {
  const [token] = await getDatabaseClient()
    .update(passwordResetTokens)
    .set({ consumedAt: now })
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.consumedAt),
        gt(passwordResetTokens.expiresAt, now),
      ),
    )
    .returning(metadataColumns);

  return token;
}

/**
 * Atomically claims a reset token, updates its account password, invalidates
 * every remaining reset token, and revokes the account's sessions.
 */
export async function resetPasswordWithToken(
  tokenHash: SecurityTokenHash,
  passwordHash: string,
  now = new Date(),
): Promise<{ userId: Uuid } | undefined> {
  return getDatabaseClient().transaction(async (transaction) => {
    const [candidate] = await transaction
      .select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId })
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.consumedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      )
      .limit(1);

    if (!candidate) return undefined;

    // Use the same user-before-token lock order as issuance to avoid deadlocks.
    const [user] = await transaction
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, candidate.userId))
      .for('update');

    if (!user) return undefined;

    const [consumed] = await transaction
      .update(passwordResetTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(passwordResetTokens.id, candidate.id),
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.consumedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      )
      .returning({ userId: passwordResetTokens.userId });

    if (!consumed) return undefined;

    await transaction
      .update(passwordResetTokens)
      .set({ consumedAt: now })
      .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.consumedAt)));

    await transaction
      .update(users)
      .set({ passwordHash, updatedAt: now })
      .where(eq(users.id, user.id));

    await revokeAllSessionsForUser(user.id, transaction);

    return { userId: user.id };
  });
}
