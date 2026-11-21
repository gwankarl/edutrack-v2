import { eq } from 'drizzle-orm';
import type { UpdateProfileRequest, Uuid } from '@edutrack/contracts';
import { getDatabaseClient } from '../../../infrastructure/database/client.js';
import { users } from '../../../infrastructure/database/schema/accounts/users.table.js';

export type UpdatedProfileRecord = Pick<typeof users.$inferSelect, 'id' | 'displayName' | 'email'>;

export async function updateProfile(
  userId: Uuid,
  input: UpdateProfileRequest,
): Promise<UpdatedProfileRecord | undefined> {
  const [profile] = await getDatabaseClient()
    .update(users)
    .set({
      displayName: input.displayName,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
    });

  return profile;
}
