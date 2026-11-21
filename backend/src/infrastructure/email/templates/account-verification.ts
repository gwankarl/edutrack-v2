export type AccountVerificationEmailInput = {
  displayName: string;
  verificationUrl: string;
};

export type RenderedEmail = { subject: string; text: string; html: string };

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderAccountVerificationEmail(
  input: AccountVerificationEmailInput,
): RenderedEmail {
  const name = escapeHtml(input.displayName);
  const url = escapeHtml(input.verificationUrl);

  return {
    subject: 'Verify your EduTrack email address',
    text: [
      `Hello ${input.displayName},`,
      '',
      'Use the following link to verify your EduTrack email address:',
      input.verificationUrl,
      '',
      'If you did not create this account, you can ignore this message.',
    ].join('\n'),
    html: [
      `<p>Hello ${name},</p>`,
      '<p>Use the link below to verify your EduTrack email address:</p>',
      `<p><a href="${url}">Verify email address</a></p>`,
      '<p>If you did not create this account, you can ignore this message.</p>',
    ].join(''),
  };
}
