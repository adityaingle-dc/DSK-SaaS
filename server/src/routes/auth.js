import { Router } from 'express';
import User from '../models/User.js';
import { protect, signToken } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { logActivity } from '../services/activity.js';

const router = Router();

// Self-registration creates a *pending* evaluator; a superadmin must approve it before it can sign in.
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { name, email, password, branch, employeeId, phone } = req.body || {};
    if (!name || !email || !password) throw new HttpError(400, 'Name, email and password are required');
    if (String(password).length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
    if (await User.exists({ email: String(email).toLowerCase().trim() })) throw new HttpError(409, 'Email already registered');

    const user = await User.create({ name, email, password, branch, employeeId, phone, role: 'evaluator', status: 'pending' });
    await logActivity(req, 'auth.register', { actor: user, entityType: 'user', entityId: user._id, summary: `${user.name} requested an evaluator account` });
    res.status(201).json({ pending: true, message: 'Account created. A superadmin must approve it before you can sign in.' });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) throw new HttpError(400, 'Email and password are required');

    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+password');
    if (!user || !(await user.comparePassword(String(password)))) {
      await logActivity(req, 'auth.login_failed', { actor: user || null, entityType: 'auth', summary: `Failed sign-in for ${String(email).slice(0, 100)}`, meta: { email: String(email).slice(0, 100) } });
      throw new HttpError(401, 'Invalid credentials');
    }
    if (user.status === 'pending') throw new HttpError(403, 'Your account is awaiting approval by the superadmin');
    if (user.status === 'disabled') throw new HttpError(403, 'Your account has been disabled. Contact the superadmin.');

    user.lastLoginAt = new Date();
    user.lastActiveAt = user.lastLoginAt;
    await user.save();
    await logActivity(req, 'auth.login', { actor: user, entityType: 'auth', summary: `${user.name} signed in` });
    res.json({ token: signToken(user), user });
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
