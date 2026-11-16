import { promises as dns } from 'node:dns';

// Practical email syntax check (RFC 5322 is far looser; this matches what real mailboxes use)
const EMAIL_RX = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

// common throwaway inbox providers: not accepted for staff accounts
const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', 'sharklasers.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org',
  'yopmail.com', 'trashmail.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'throwawaymail.com', 'fakeinbox.com', 'mailnesia.com',
  'emailondeck.com', 'mohmal.com', 'tempinbox.com', 'mintemail.com', 'spamgourmet.com',
]);

export const normaliseEmail = (email) => String(email ?? '').trim().toLowerCase();

// Format-only check, e.g. for the sign-in form
export function isEmailFormat(email) {
  const e = normaliseEmail(email);
  if (!e || e.length > 200 || !EMAIL_RX.test(e)) return false;
  const [local, domain] = e.split('@');
  return local.length <= 64 && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..') && /\.[a-z]{2,}$/.test(domain);
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), ms))]);

// Can this domain receive mail? MX records, or an A/AAAA record (implicit MX).
// DNS failures that aren't a definite "no such domain" are treated as deliverable so an outage never blocks sign-up.
async function domainReceivesMail(domain) {
  try {
    const mx = await withTimeout(dns.resolveMx(domain), 4000);
    if (mx.some((r) => r.exchange && r.exchange !== '.')) return true;
    return false; // null MX ("."): explicitly accepts no mail
  } catch (err) {
    if (!['ENOTFOUND', 'ENODATA'].includes(err.code)) return true;
    try {
      const a = await withTimeout(dns.resolve(domain), 3000);
      return a.length > 0;
    } catch (e2) {
      return !['ENOTFOUND', 'ENODATA'].includes(e2.code);
    }
  }
}

// Full validation for an address we are about to send mail to / create an account for.
// Returns null when fine, or a human-readable reason.
export async function emailProblem(email, { checkDns = process.env.EMAIL_DNS_CHECK !== 'false' } = {}) {
  const e = normaliseEmail(email);
  if (!e) return 'Email is required';
  if (!isEmailFormat(e)) return 'Enter a valid email address, e.g. name@bank.in';
  const domain = e.split('@')[1];
  if (DISPOSABLE.has(domain)) return 'Temporary / disposable email addresses are not allowed';
  if (checkDns && !(await domainReceivesMail(domain))) return `“${domain}” can't receive email. Check the address for typos.`;
  return null;
}
