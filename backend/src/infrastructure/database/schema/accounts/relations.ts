import { relations } from 'drizzle-orm';
import { emailVerificationTokens } from './email-verification-tokens.table.js';
import { passwordResetTokens } from './password-reset-tokens.table.js';
import { sessions } from './sessions.table.js';
import { userRoles } from './user-roles.table.js';
import { users } from './users.table.js';

export const usersRelations = relations(users, ({ many }) => ({
  roleAssignments: many(userRoles, { relationName: 'roleSubject' }),
  roleAssignmentsCreated: many(userRoles, { relationName: 'roleAssigner' }),
  sessions: many(sessions),
  emailVerificationTokens: many(emailVerificationTokens),
  passwordResetTokens: many(passwordResetTokens),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
    relationName: 'roleSubject',
  }),
  assignedBy: one(users, {
    fields: [userRoles.assignedByUserId],
    references: [users.id],
    relationName: 'roleAssigner',
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({ one }) => ({
  user: one(users, {
    fields: [emailVerificationTokens.userId],
    references: [users.id],
  }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}));
