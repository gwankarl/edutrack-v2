import { sql } from 'drizzle-orm';
import { check, index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users.table.js';

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    check('sessions_token_hash_sha256_hex', sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check('sessions_expiration_after_creation', sql`${table.expiresAt} > ${table.createdAt}`),
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    index('sessions_expires_at_idx').on(table.expiresAt),
    index('sessions_user_created_at_idx').on(table.userId, table.createdAt),
  ],
);
