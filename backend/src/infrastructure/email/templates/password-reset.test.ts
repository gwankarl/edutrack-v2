import { describe, expect, it } from 'vitest';
import { renderPasswordResetEmail } from './password-reset.js';

describe('renderPasswordResetEmail', () => {
  it('returns plain text and safely escapes HTML values', () => {
    const email = renderPasswordResetEmail({
      displayName: 'Student "One"',
      resetUrl: 'https://localhost:5173/reset-password?token=synthetic&next=%2Fhome',
    });

    expect(email.text).toContain('Student "One"');
    expect(email.html).toContain('Student &quot;One&quot;');
    expect(email.html).toContain('&amp;next=');
    expect(email.subject).toContain('Reset');
  });
});
