import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Uuid } from '@edutrack/contracts';
import { getDatabaseClient } from '../../infrastructure/database/client.js';
import { sessions } from '../../infrastructure/database/schema/accounts/sessions.table.js';
import type { SessionTokenHash } from '../../infrastructure/security/session-token.js';

export type CreateSessionInput = Pick<
  typeof sessions.$inferInsert,
  'userId' | 'tokenHash' | 'expiresAt'
>;

export type SessionRecord = Pick<
  typeof sessions.$inferSelect,
  'id' | 'userId' | 'createdAt' | 'expiresAt' | 'revokedAt'
>;

type SessionUpdateExecutor = Pick<ReturnType<typeof getDatabaseClient>, 'update'>;

// Keep the token hash internal to persistence and lookup operations.
const sessionRecordColumns = {
  id: sessions.id,
  userId: sessions.userId,
  createdAt: sessions.createdAt,
  expiresAt: sessions.expiresAt,
  revokedAt: sessions.revokedAt,
};

export async function createSession(input: CreateSessionInput): Promise<SessionRecord> {
  const [session] = await getDatabaseClient()
    .insert(sessions)
    .values(input)
    .returning(sessionRecordColumns);

  if (!session) {
    throw new Error('Session creation did not return a record.');
  }

  return session;
}

export async function findActiveSessionByTokenHash(
  tokenHash: SessionTokenHash,
): Promise<SessionRecord | undefined> {
  const [session] = await getDatabaseClient()
    .select(sessionRecordColumns)
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        gt(sessions.expiresAt, new Date()),
        isNull(sessions.revokedAt),
      ),
    )
    .limit(1);

  return session;
}

/**
 * Revokes a session once. Returns false if it does not exist or is already revoked.
 */
export async function revokeSessionById(sessionId: Uuid): Promise<boolean> {
  const [session] = await getDatabaseClient()
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });

  return session !== undefined;
}

/** Atomically revokes the session matching this hash without exposing whether it existed. */
export async function revokeSessionByTokenHash(tokenHash: SessionTokenHash): Promise<boolean> {
  const [session] = await getDatabaseClient()
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });

  return session !== undefined;
}

/**
 * Marks every not-yet-revoked session for the user as revoked.
 * Returns the number of rows changed.
 */
export async function revokeAllSessionsForUser(
  userId: Uuid,
  executor: SessionUpdateExecutor = getDatabaseClient(),
): Promise<number> {
  const revoked = await executor
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });

  return revoked.length;
}
