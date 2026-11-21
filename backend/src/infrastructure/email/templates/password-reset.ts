export type PasswordResetEmailInput = { displayName: string; resetUrl: string };

export type RenderedEmail = { subject: string; text: string; html: string };

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderPasswordResetEmail(input: PasswordResetEmailInput): RenderedEmail {
  const name = escapeHtml(input.displayName);
  const url = escapeHtml(input.resetUrl);

  return {
    subject: 'Reset your EduTrack password',
    text: [
      `Hello ${input.displayName},`,
      '',
      'Use the following link to reset your EduTrack password:',
      input.resetUrl,
      '',
      'If you did not request a password reset, you can ignore this message.',
    ].join('\n'),
    html: [
      `<p>Hello ${name},</p>`,
      '<p>Use the link below to reset your EduTrack password:</p>',
      `<p><a href="${url}">Reset password</a></p>`,
      '<p>If you did not request a password reset, you can ignore this message.</p>',
    ].join(''),
  };
}
