import { describe, expect, it } from 'vitest';
import { renderAccountVerificationEmail } from './account-verification.js';

describe('renderAccountVerificationEmail', () => {
  it('returns plain text and escapes user content and URL attributes in HTML', () => {
    const email = renderAccountVerificationEmail({
      displayName: '<img src=x onerror=alert(1)>',
      verificationUrl: 'https://localhost:5173/verify?token=synthetic&next=%2Fhome',
    });

    expect(email.text).toContain('<img src=x onerror=alert(1)>');
    expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(email.html).not.toContain('<img');
    expect(email.html).toContain('&amp;next=');
    expect(email.subject).toContain('Verify');
  });
});
