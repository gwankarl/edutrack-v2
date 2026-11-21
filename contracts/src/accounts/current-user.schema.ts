import { z } from 'zod';

import { createSuccessResponseSchema } from '../common/api-response.schema.js';
import { publicAccountSchema } from './public-account.schema.js';
import { accountRoleSchema } from './account-role.schema.js';

export const currentUserSchema = publicAccountSchema
  .extend({
    roles: z.array(accountRoleSchema),
  })
  .strict();

export const currentUserResponseSchema = createSuccessResponseSchema(currentUserSchema);

export type CurrentUser = z.infer<typeof currentUserSchema>;
export type CurrentUserResponse = z.infer<typeof currentUserResponseSchema>;
