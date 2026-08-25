const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  );

export type EmailTemplate = { subject: string; html: string; text: string };

function layout(title: string, body: string, text: string): EmailTemplate {
  return {
    subject: title,
    html: `<!doctype html><html><body style="margin:0;background:#0c1110;color:#eef5f0;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:40px 24px"><div style="font-size:20px;font-weight:700;letter-spacing:-.02em;color:#8fe0b0">Slice</div><div style="margin-top:28px;padding:28px;background:#151d1a;border:1px solid #2a3932;border-radius:12px"><h1 style="margin:0 0 16px;font-size:26px;line-height:1.2;color:#f5fbf7">${escapeHtml(title)}</h1>${body}</div><p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#91a39a">This is a transactional message from Slice. If you did not request this, you can safely ignore it.</p></div></body></html>`,
    text: `Slice\n\n${title}\n\n${text}\n\nIf you did not request this, you can safely ignore this email.`,
  };
}

export function verificationEmail(input: { url: string; expiresIn: string }) {
  return layout(
    'Verify your Slice email',
    `<p style="font-size:15px;line-height:1.6;color:#c7d5cc">Confirm your email address to continue setting up your Slice account.</p><p style="margin:26px 0"><a href="${escapeHtml(input.url)}" style="display:inline-block;padding:12px 18px;background:#8fe0b0;color:#0c1110;text-decoration:none;font-weight:700;border-radius:7px">Verify email</a></p><p style="font-size:13px;line-height:1.6;color:#91a39a">This link expires in ${escapeHtml(input.expiresIn)}. If the button does not work, copy this URL into your browser:</p><p style="font-size:12px;line-height:1.5;word-break:break-all;color:#8fe0b0">${escapeHtml(input.url)}</p>`,
    `Confirm your email: ${input.url}\n\nThis link expires in ${input.expiresIn}.`,
  );
}

export function passwordResetEmail(input: { url: string; expiresIn: string }) {
  return layout(
    'Reset your Slice password',
    `<p style="font-size:15px;line-height:1.6;color:#c7d5cc">A request was made to reset the password for your Slice account.</p><p style="margin:26px 0"><a href="${escapeHtml(input.url)}" style="display:inline-block;padding:12px 18px;background:#8fe0b0;color:#0c1110;text-decoration:none;font-weight:700;border-radius:7px">Reset password</a></p><p style="font-size:13px;line-height:1.6;color:#91a39a">This link expires in ${escapeHtml(input.expiresIn)} and can only be used once. Slice will never ask you to share your password.</p><p style="font-size:12px;line-height:1.5;word-break:break-all;color:#8fe0b0">${escapeHtml(input.url)}</p>`,
    `Reset your password: ${input.url}\n\nThis link expires in ${input.expiresIn} and can only be used once.`,
  );
}

export function securityNotificationEmail(input: {
  title: string;
  detail: string;
}) {
  return layout(
    input.title,
    `<p style="font-size:15px;line-height:1.6;color:#c7d5cc">${escapeHtml(input.detail)}</p><p style="font-size:13px;line-height:1.6;color:#91a39a">If this was not you, sign in to Slice and review your security settings immediately.</p>`,
    `${input.detail}\n\nIf this was not you, sign in to Slice and review your security settings immediately.`,
  );
}

export function financialNotificationEmail(input: {
  title: string;
  detail: string;
}) {
  return layout(
    input.title,
    `<p style="font-size:15px;line-height:1.6;color:#c7d5cc">${escapeHtml(input.detail)}</p><p style="font-size:13px;line-height:1.6;color:#91a39a">You can review your Wallet and account notifications in Slice for the current status and next steps.</p>`,
    `${input.detail}\n\nYou can review your Wallet and account notifications in Slice for the current status and next steps.`,
  );
}
