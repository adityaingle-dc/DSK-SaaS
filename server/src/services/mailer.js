import { HttpError } from '../utils/asyncHandler.js';

// Email through SendGrid's Web API (https://api.sendgrid.com/v3/mail/send).
//   SENDGRID_API_KEY  – API key with "Mail Send" permission
//   MAIL_FROM         – a sender verified in SendGrid, e.g. no-reply@dskrishna.in
//   MAIL_FROM_NAME    – optional display name (default DSKRISHNA)
// Without an API key: development prints the mail to the server console; production refuses to send.
const APP = () => process.env.MAIL_FROM_NAME || 'DSKRISHNA';
const isProd = () => process.env.NODE_ENV === 'production';

export async function sendMail({ to, subject, text, html }) {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) {
    if (isProd()) throw new HttpError(503, 'Email is not configured on the server. Contact the administrator.');
    console.log(`\n[mail:dev] to=${to}\n[mail:dev] subject=${subject}\n${text}\n`);
    return { dev: true };
  }
  if (!process.env.MAIL_FROM) throw new HttpError(503, 'Email sender (MAIL_FROM) is not configured on the server.');

  let res;
  try {
    res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: process.env.MAIL_FROM, name: APP() },
        subject,
        content: [{ type: 'text/plain', value: text }, ...(html ? [{ type: 'text/html', value: html }] : [])],
        // one-time codes must not be rewritten by click / open tracking
        tracking_settings: { click_tracking: { enable: false, enable_text: false }, open_tracking: { enable: false } },
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.error('[mail] SendGrid unreachable:', err.message);
    throw new HttpError(502, 'Could not send the email right now. Please try again in a minute.');
  }
  if (res.status !== 202) {
    const detail = await res.text().catch(() => '');
    console.error(`[mail] SendGrid ${res.status}: ${detail.slice(0, 300)}`);
    throw new HttpError(502, 'Could not send the email right now. Please try again in a minute.');
  }
  return { ok: true };
}

const PURPOSE_TEXT = {
  login: { subject: 'sign-in code', lead: 'Use this code to finish signing in.' },
  register: { subject: 'email verification code', lead: 'Use this code to verify your email and send your account request.' },
  reset: { subject: 'password reset code', lead: 'Use this code to set a new password.' },
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function sendOtpMail({ to, name, code, purpose, minutes }) {
  const p = PURPOSE_TEXT[purpose] || PURPOSE_TEXT.login;
  const hello = name ? `Hello ${name},` : 'Hello,';
  const footer = purpose === 'reset'
    ? "If you didn't ask to reset your password, ignore this email. Your password stays the same."
    : "If you didn't request it, you can ignore this email.";
  const text = `${hello}\n\n${p.lead}\n\n${code}\n\nThe code expires in ${minutes} minutes. ${footer}\n\n${APP()}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6fa;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px">
<tr><td style="padding:24px 28px 0;font-size:16px;font-weight:800;letter-spacing:-0.01em;color:#105dad">${esc(APP())}</td></tr>
<tr><td style="padding:16px 28px 0;font-size:15px;line-height:1.5">${esc(hello)}<br>${esc(p.lead)}</td></tr>
<tr><td style="padding:20px 28px"><div style="font-size:32px;font-weight:700;letter-spacing:10px;text-align:center;padding:16px;border-radius:10px;background:#eff4ff;color:#1e3a8a">${esc(code)}</div></td></tr>
<tr><td style="padding:0 28px 24px;font-size:13px;line-height:1.5;color:#64748b">The code expires in ${minutes} minutes. ${esc(footer)}</td></tr>
</table></td></tr></table></body></html>`;
  return sendMail({ to, subject: `${code} is your ${APP()} ${p.subject}`, text, html });
}
