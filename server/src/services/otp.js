import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Otp from '../models/Otp.js';
import { HttpError } from '../utils/asyncHandler.js';
import { sendOtpMail } from './mailer.js';

export const OTP_MINUTES = Number(process.env.OTP_TTL_MINUTES) || 10;
export const RESEND_SECONDS = 30;
const MAX_ATTEMPTS = 5; // wrong codes per challenge
const MAX_SENDS = 5; // emails per challenge (first + resends)
const MAX_PER_WINDOW = 6; // new challenges per email per 15 minutes

const secret = () => process.env.OTP_SECRET || process.env.JWT_SECRET || 'dev-otp-secret';
const hash = (id, code) => crypto.createHmac('sha256', secret()).update(`${id}:${code}`).digest('hex');
const newCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// "aditya@bank.in" -> "ad••••@bank.in"
export const maskEmail = (email) => {
  const [local = '', domain = ''] = String(email).split('@');
  return `${local.slice(0, Math.min(2, local.length))}${'•'.repeat(Math.max(2, Math.min(6, local.length - 2)))}@${domain}`;
};

const challengeInfo = (otp) => ({
  otpRequired: true,
  challengeId: String(otp._id),
  email: maskEmail(otp.email),
  expiresIn: Math.max(0, Math.round((otp.expiresAt - Date.now()) / 1000)),
  resendIn: RESEND_SECONDS,
});

// Start a challenge and email the code. send=false creates a challenge without emailing
// (password reset for an unknown address: the response looks the same, but no code exists).
export async function startOtp({ purpose, email, user, name, payload, send = true }) {
  const recent = await Otp.countDocuments({ email, createdAt: { $gte: new Date(Date.now() - 15 * 60e3) } });
  if (recent >= MAX_PER_WINDOW) throw new HttpError(429, 'Too many codes requested for this email. Please wait 15 minutes and try again.');
  // retire earlier unused codes (kept until expiry so they still count towards the limit)
  await Otp.updateMany({ email, purpose, usedAt: null }, { usedAt: new Date() });

  const code = newCode();
  const otp = new Otp({ purpose, email, user, payload, expiresAt: new Date(Date.now() + OTP_MINUTES * 60e3) });
  otp.codeHash = hash(otp._id, send ? code : crypto.randomUUID());
  await otp.save();
  if (send) {
    try {
      await sendOtpMail({ to: email, name, code, purpose, minutes: OTP_MINUTES });
    } catch (err) {
      await Otp.deleteOne({ _id: otp._id });
      throw err;
    }
  }
  return challengeInfo(otp);
}

async function load(challengeId, purpose) {
  if (!mongoose.isValidObjectId(challengeId)) throw new HttpError(410, 'This code has expired. Request a new code.');
  const otp = await Otp.findOne({ _id: challengeId, purpose });
  if (!otp || otp.usedAt || otp.expiresAt < new Date()) throw new HttpError(410, 'This code has expired. Request a new code.');
  return otp;
}

// Check a code; returns the challenge (marked used) when it matches.
export async function verifyOtp({ challengeId, code, purpose }) {
  const otp = await load(challengeId, purpose);
  if (otp.attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'Too many incorrect codes. Request a new code.');
  const clean = String(code ?? '').replace(/\D/g, '');
  if (clean.length !== 6 || !same(hash(otp._id, clean), otp.codeHash)) {
    otp.attempts += 1;
    await otp.save();
    const left = MAX_ATTEMPTS - otp.attempts;
    const err = new HttpError(400, left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many incorrect codes. Request a new code.');
    err.otp = otp;
    throw err;
  }
  // single use, atomically
  const used = await Otp.findOneAndUpdate({ _id: otp._id, usedAt: null }, { usedAt: new Date() }, { new: true });
  if (!used) throw new HttpError(410, 'This code has already been used.');
  return used;
}

// Send a fresh code for an existing challenge (after the cooldown).
export async function resendOtp({ challengeId }) {
  if (!mongoose.isValidObjectId(challengeId)) throw new HttpError(410, 'Please start again.');
  const otp = await Otp.findById(challengeId);
  if (!otp || otp.usedAt) throw new HttpError(410, 'This request has expired. Please start again.');
  const wait = RESEND_SECONDS - Math.floor((Date.now() - otp.lastSentAt) / 1000);
  if (wait > 0) throw new HttpError(429, `Please wait ${wait}s before requesting another code.`);
  if (otp.sends >= MAX_SENDS) throw new HttpError(429, 'Too many codes sent. Please start again in a few minutes.');

  const code = newCode();
  // password reset for an unknown address: behave the same, but never email or create a usable code
  const real = otp.purpose !== 'reset' || Boolean(otp.user);
  Object.assign(otp, { codeHash: hash(otp._id, real ? code : crypto.randomUUID()), attempts: 0, sends: otp.sends + 1, lastSentAt: new Date(), expiresAt: new Date(Date.now() + OTP_MINUTES * 60e3) });
  await otp.save();
  if (real) await sendOtpMail({ to: otp.email, name: otp.payload?.name, code, purpose: otp.purpose, minutes: OTP_MINUTES });
  return challengeInfo(otp);
}
