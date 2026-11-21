import { z } from 'zod';

export const accountRoleValues = ['student', 'teacher', 'administrator'] as const;

export const accountRoleSchema = z.enum(accountRoleValues);

export type AccountRole = z.infer<typeof accountRoleSchema>;
