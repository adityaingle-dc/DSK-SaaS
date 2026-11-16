// Client-side email check (the server re-validates and also checks the domain can receive mail)
const EMAIL_RX = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

// common misspellings of big providers
const TYPOS = { 'gmial.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gnail.com': 'gmail.com', 'yaho.com': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'hotmial.com': 'hotmail.com', 'outlok.com': 'outlook.com', 'rediffmail.co': 'rediffmail.com' };

// null when fine, otherwise a message
export function emailError(value) {
  const e = String(value || '').trim().toLowerCase();
  if (!e) return 'Email is required';
  if (e.length > 200 || !EMAIL_RX.test(e)) return 'Enter a valid email address, e.g. name@bank.in';
  const [local, domain] = e.split('@');
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..') || !/\.[a-z]{2,}$/.test(domain)) return 'Enter a valid email address, e.g. name@bank.in';
  if (TYPOS[domain]) return `Did you mean ${local}@${TYPOS[domain]}?`;
  return null;
}
