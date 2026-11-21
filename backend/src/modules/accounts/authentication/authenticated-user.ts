import type { AccountRole, Uuid } from '@edutrack/contracts';

export type AuthenticatedUserContext = {
  id: Uuid;
  displayName: string;
  email: string;
  roles: AccountRole[];
  sessionId: Uuid;
};
