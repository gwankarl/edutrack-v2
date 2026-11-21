export const EMAIL_VERIFICATION_TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
export const EMAIL_VERIFICATION_MAX_ISSUANCES_PER_DAY = 5;
export const PASSWORD_RESET_TOKEN_LIFETIME_MS = 30 * 60 * 1000;
export const PASSWORD_RESET_RESEND_COOLDOWN_MS = 60 * 1000;
export const PASSWORD_RESET_MAX_ISSUANCES_PER_DAY = 5;

export function getEmailVerificationTokenExpiration(now = new Date()): Date {
  return new Date(now.getTime() + EMAIL_VERIFICATION_TOKEN_LIFETIME_MS);
}

export function getPasswordResetTokenExpiration(now = new Date()): Date {
  return new Date(now.getTime() + PASSWORD_RESET_TOKEN_LIFETIME_MS);
}
