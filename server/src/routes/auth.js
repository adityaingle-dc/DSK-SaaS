import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { protect, signToken } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { logActivity } from '../services/activity.js';
import { emailProblem, isEmailFormat, normaliseEmail } from '../utils/email.js';
import { resendOtp, startOtp, verifyOtp } from '../services/otp.js';

const router = Router();

// ---------- email codes (SendGrid) ----------
// Sign-in: password + a code emailed to the user. Skipped for addresses that can't receive mail
// (e.g. a seed account like admin@bank.local) and when OTP_LOGIN=false (emergency switch).
const UNDELIVERABLE = /\.(local|localhost|test|invalid|example|internal)$/i;
const needsLoginOtp = (user) => process.env.OTP_LOGIN !== 'false' && !UNDELIVERABLE.test(String(user.email).split('@')[1] || '');

const accountBlock = (user) => {
  if (user.status === 'pending') return new HttpError(403, 'Your account is awaiting approval by the superadmin');
  if (user.status === 'disabled') return new HttpError(403, 'Your account has been disabled. Contact the superadmin.');
  return null;
};
const failedLogin = (req, user, email, summary) =>
  logActivity(req, 'auth.login_failed', { actor: user || null, entityType: 'auth', summary, meta: { email: String(email).slice(0, 100) } });

async function completeLogin(req, res, user) {
  user.lastLoginAt = new Date();
  user.lastActiveAt = user.lastLoginAt;
  await user.save();
  await logActivity(req, 'auth.login', { actor: user, entityType: 'auth', summary: `${user.name} signed in` });
  res.json({ token: signToken(user), user });
}

async function checkEmail(email) {
  const problem = await emailProblem(email);
  if (problem) {
    const err = new HttpError(422, problem);
    err.details = [{ field: 'email', message: problem }];
    throw err;
  }
}

// ---- account request: details → email code → pending evaluator (the superadmin approves) ----
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { name, password, branch, phone } = req.body || {};
    const email = normaliseEmail(req.body?.email);
    if (!String(name || '').trim() || !email || !password) throw new HttpError(400, 'Name, email and password are required');
    if (String(password).length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
    await checkEmail(email);
    if (await User.exists({ email })) throw new HttpError(409, 'This email is already registered. Sign in instead.');
    const clip = (v, n) => (v == null ? undefined : String(v).trim().slice(0, n) || undefined);
    const payload = { name: String(name).trim().slice(0, 120), passwordHash: await bcrypt.hash(String(password), 10), branch: clip(branch, 120), phone: clip(phone, 20) };
    res.status(202).json(await startOtp({ purpose: 'register', email, name: payload.name, payload }));
  })
);

router.post(
  '/register/verify',
  asyncHandler(async (req, res) => {
    const otp = await verifyOtp({ challengeId: req.body?.challengeId, code: req.body?.code, purpose: 'register' });
    const p = otp.payload || {};
    if (await User.exists({ email: otp.email })) throw new HttpError(409, 'This email is already registered. Sign in instead.');
    const user = new User({ name: p.name, email: otp.email, password: p.passwordHash, branch: p.branch, phone: p.phone, role: 'evaluator', status: 'pending', emailVerifiedAt: new Date() });
    user.$locals.passwordIsHash = true; // hashed when the request was started
    await user.save();
    await logActivity(req, 'auth.register', { actor: user, entityType: 'user', entityId: user._id, summary: `${user.name} requested an evaluator account (email verified)` });
    res.status(201).json({ pending: true, message: 'Email verified. A superadmin must approve your account before you can sign in.' });
  })
);

// ---- sign-in: password → code → token ----
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) throw new HttpError(400, 'Email and password are required');
    if (!isEmailFormat(email)) throw new HttpError(400, 'Enter a valid email address');
    const user = await User.findOne({ email: normaliseEmail(email) }).select('+password');
    if (!user || !(await user.comparePassword(String(password)))) {
      await failedLogin(req, user, email, `Failed sign-in for ${String(email).slice(0, 100)}`);
      throw new HttpError(401, 'Invalid credentials');
    }
    const blocked = accountBlock(user);
    if (blocked) throw blocked;
    if (!needsLoginOtp(user)) return completeLogin(req, res, user);
    res.status(202).json(await startOtp({ purpose: 'login', email: user.email, user: user._id, name: user.name }));
  })
);

router.post(
  '/login/verify',
  asyncHandler(async (req, res) => {
    let otp;
    try {
      otp = await verifyOtp({ challengeId: req.body?.challengeId, code: req.body?.code, purpose: 'login' });
    } catch (err) {
      if (err.otp) await failedLogin(req, null, err.otp.email, `Wrong sign-in code for ${err.otp.email}`);
      throw err;
    }
    const user = await User.findById(otp.user);
    if (!user) throw new HttpError(401, 'Account not found');
    const blocked = accountBlock(user);
    if (blocked) throw blocked;
    if (!user.emailVerifiedAt) user.emailVerifiedAt = new Date();
    await completeLogin(req, res, user);
  })
);

router.post('/otp/resend', asyncHandler(async (req, res) => res.json(await resendOtp({ challengeId: req.body?.challengeId }))));

// ---- forgot password: email → code → new password ----
// The response is the same whether or not the address has an account (no account discovery).
router.post(
  '/password/forgot',
  asyncHandler(async (req, res) => {
    const email = normaliseEmail(req.body?.email);
    if (!isEmailFormat(email)) throw new HttpError(400, 'Enter a valid email address');
    const user = await User.findOne({ email, status: { $ne: 'disabled' } });
    const deliverable = user && !UNDELIVERABLE.test(email.split('@')[1] || '');
    res.status(202).json(await startOtp({ purpose: 'reset', email, user: deliverable ? user._id : undefined, name: user?.name, send: Boolean(deliverable) }));
  })
);

router.post(
  '/password/reset',
  asyncHandler(async (req, res) => {
    const { challengeId, code, password } = req.body || {};
    if (!password || String(password).length < 8) throw new HttpError(400, 'New password must be at least 8 characters');
    const otp = await verifyOtp({ challengeId, code, purpose: 'reset' });
    const user = otp.user && (await User.findById(otp.user).select('+password'));
    if (!user || user.status === 'disabled') throw new HttpError(400, 'This code is not valid. Request a new one.');
    user.password = String(password);
    user.mustChangePassword = false;
    if (!user.emailVerifiedAt) user.emailVerifiedAt = new Date();
    await user.save();
    await logActivity(req, 'auth.password_changed', { actor: user, entityType: 'user', entityId: user._id, summary: `${user.name} reset their password with an email code` });
    res.json({ ok: true });
  })
);

router.get('/me', protect, (req, res) => res.json({ user: req.user }));

router.post(
  '/change-password',
  protect,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 8) throw new HttpError(400, 'New password must be at least 8 characters');
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(String(currentPassword || '')))) throw new HttpError(400, 'Current password is incorrect');
    if (await user.comparePassword(String(newPassword))) throw new HttpError(400, 'New password must be different from the current one');
    user.password = String(newPassword);
    user.mustChangePassword = false;
    await user.save();
    await logActivity(req, 'auth.password_changed', { entityType: 'user', entityId: user._id, summary: `${user.name} changed their password` });
    res.json({ user });
  })
);

export default router;
