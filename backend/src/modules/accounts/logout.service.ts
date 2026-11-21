import {
  hashSessionToken,
  isValidSessionToken,
} from '../../infrastructure/security/session-token.js';
import { revokeSessionByTokenHash } from './session-repository.js';

export async function logoutSession(token: string | undefined): Promise<void> {
  if (!token || !isValidSessionToken(token)) {
    return;
  }

  await revokeSessionByTokenHash(hashSessionToken(token));
}
