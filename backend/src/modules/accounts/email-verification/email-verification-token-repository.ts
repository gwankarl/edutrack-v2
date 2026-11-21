import { and, desc, eq, gt, gte, isNull } from 'drizzle-orm';
import type { Uuid } from '@edutrack/contracts';
import { getDatabaseClient } from '../../../infrastructure/database/client.js';
import { emailVerificationTokens } from '../../../infrastructure/database/schema/accounts/email-verification-tokens.table.js';
import { users } from '../../../infrastructure/database/schema/accounts/users.table.js';
import {
  EMAIL_VERIFICATION_MAX_ISSUANCES_PER_DAY,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
} from '../../../infrastructure/security/account-token-policy.js';
import type { SecurityTokenHash } from '../../../infrastructure/security/security-token.js';
import { EmailVerificationIssuanceLimitError } from '../account-repository.errors.js';

export type EmailVerificationTokenMetadata = Pick<
  typeof emailVerificationTokens.$inferSelect,
  'id' | 'userId' | 'createdAt' | 'expiresAt' | 'consumedAt'
>;

export type IssueEmailVerificationTokenInput = {
  userId: Uuid;
  tokenHash: SecurityTokenHash;
  createdAt: Date;
  expiresAt: Date;
};

const metadataColumns = {
  id: emailVerificationTokens.id,
  userId: emailVerificationTokens.userId,
  createdAt: emailVerificationTokens.createdAt,
  expiresAt: emailVerificationTokens.expiresAt,
  consumedAt: emailVerificationTokens.consumedAt,
};

export async function issueEmailVerificationToken(
  input: IssueEmailVerificationTokenInput,
): Promise<EmailVerificationTokenMetadata> {
  return getDatabaseClient().transaction(async (transaction) => {
    // Serialize replacement issuance for the same account.
    const [user] = await transaction
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, input.userId))
      .for('update');

    if (!user) {
      throw new Error('Cannot issue an email verification token for a missing account.');
    }

    const dayAgo = new Date(input.createdAt.getTime() - 24 * 60 * 60 * 1000);
    const recentIssuances = await transaction
      .select({ createdAt: emailVerificationTokens.createdAt })
      .from(emailVerificationTokens)
      .where(
        and(
          eq(emailVerificationTokens.userId, input.userId),
          gte(emailVerificationTokens.createdAt, dayAgo),
        ),
      )
      .orderBy(desc(emailVerificationTokens.createdAt))
      .limit(EMAIL_VERIFICATION_MAX_ISSUANCES_PER_DAY);

    if (
      recentIssuances.length >= EMAIL_VERIFICATION_MAX_ISSUANCES_PER_DAY ||
      (recentIssuances[0] &&
        input.createdAt.getTime() - recentIssuances[0].createdAt.getTime() <
          EMAIL_VERIFICATION_RESEND_COOLDOWN_MS)
    ) {
      throw new EmailVerificationIssuanceLimitError();
    }

    await transaction
      .update(emailVerificationTokens)
      .set({ consumedAt: input.createdAt })
      .where(
        and(
          eq(emailVerificationTokens.userId, input.userId),
          isNull(emailVerificationTokens.consumedAt),
          gt(emailVerificationTokens.expiresAt, input.createdAt),
        ),
      );

    const [token] = await transaction
      .insert(emailVerificationTokens)
      .values(input)
      .returning(metadataColumns);

    if (!token) {
      throw new Error('Email verification token creation did not return a record.');
    }

    return token;
  });
}

export async function findActiveEmailVerificationToken(
  tokenHash: SecurityTokenHash,
  now = new Date(),
): Promise<EmailVerificationTokenMetadata | undefined> {
  const [token] = await getDatabaseClient()
    .select(metadataColumns)
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.tokenHash, tokenHash),
        isNull(emailVerificationTokens.consumedAt),
        gt(emailVerificationTokens.expiresAt, now),
      ),
    )
    .limit(1);

  return token;
}

/** Conditional UPDATE makes consumption single-use, including under concurrent requests. */
export async function consumeEmailVerificationToken(
  tokenHash: SecurityTokenHash,
  now = new Date(),
): Promise<EmailVerificationTokenMetadata | undefined> {
  const [token] = await getDatabaseClient()
    .update(emailVerificationTokens)
    .set({ consumedAt: now })
    .where(
      and(
        eq(emailVerificationTokens.tokenHash, tokenHash),
        isNull(emailVerificationTokens.consumedAt),
        gt(emailVerificationTokens.expiresAt, now),
      ),
    )
    .returning(metadataColumns);

  return token;
}

/**
 * Consume the winning token and update verification state in one transaction.
 * Locking the user before the token preserves the same lock order as issuance.
 */
export async function confirmEmailVerification(
  tokenHash: SecurityTokenHash,
  now = new Date(),
): Promise<{ userId: Uuid } | undefined> {
  return getDatabaseClient().transaction(async (transaction) => {
    const [candidate] = await transaction
      .select({ userId: emailVerificationTokens.userId })
      .from(emailVerificationTokens)
      .where(
        and(
          eq(emailVerificationTokens.tokenHash, tokenHash),
          isNull(emailVerificationTokens.consumedAt),
          gt(emailVerificationTokens.expiresAt, now),
        ),
      )
      .limit(1);

    if (!candidate) return undefined;

    const [user] = await transaction
      .select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, candidate.userId))
      .for('update');

    if (!user) return undefined;

    const [consumed] = await transaction
      .update(emailVerificationTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(emailVerificationTokens.tokenHash, tokenHash),
          isNull(emailVerificationTokens.consumedAt),
          gt(emailVerificationTokens.expiresAt, now),
        ),
      )
      .returning({ userId: emailVerificationTokens.userId });

    if (!consumed) return undefined;

    if (!user.emailVerifiedAt) {
      await transaction
        .update(users)
        .set({ emailVerifiedAt: now, updatedAt: now })
        .where(eq(users.id, consumed.userId));
    }

    await transaction
      .update(emailVerificationTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(emailVerificationTokens.userId, consumed.userId),
          isNull(emailVerificationTokens.consumedAt),
        ),
      );

    return { userId: consumed.userId };
  });
}
