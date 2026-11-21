import { z } from 'zod';

// New passwords follow the existing registration policy. Do not trim passwords.
export const newPasswordSchema = z.string().min(12).max(128);

// Existing credentials must remain compatible with login's 1–128 character rule.
export const currentPasswordSchema = z.string().min(1).max(128);

export type NewPassword = z.infer<typeof newPasswordSchema>;
export type CurrentPassword = z.infer<typeof currentPasswordSchema>;
