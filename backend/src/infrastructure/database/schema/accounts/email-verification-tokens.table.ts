import { sql } from 'drizzle-orm';
import { check, index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users.table.js';

export const emailVerificationTokens = pgTable(
  'email_verification_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'email_verification_tokens_token_hash_sha256_hex',
      sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'email_verification_tokens_expiration_after_creation',
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    uniqueIndex('email_verification_tokens_token_hash_unique').on(table.tokenHash),
    index('email_verification_tokens_expires_at_idx').on(table.expiresAt),
    index('email_verification_tokens_user_unconsumed_idx')
      .on(table.userId)
      .where(sql`${table.consumedAt} IS NULL`),
  ],
);
