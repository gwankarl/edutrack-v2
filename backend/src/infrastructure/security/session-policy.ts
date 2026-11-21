export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export function getSessionExpiration(now = new Date()): Date {
  return new Date(now.getTime() + SESSION_LIFETIME_MS);
}
