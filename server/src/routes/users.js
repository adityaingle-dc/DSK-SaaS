import { Router } from 'express';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import User, { ROLES, USER_STATUSES } from '../models/User.js';
import ActivityLog from '../models/ActivityLog.js';
import { protect, requireSuperadmin } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { logActivity } from '../services/activity.js';
import { EMPTY_STATS, evaluatorStats } from '../services/teamStats.js';

// Team management – superadmin only
const router = Router();
router.use(protect, requireSuperadmin);

const EDITABLE = ['name', 'phone', 'branch', 'employeeId', 'role', 'status'];
const pick = (body) => Object.fromEntries(Object.entries(body || {}).filter(([k, v]) => EDITABLE.includes(k) && v !== undefined));

// Readable temporary password, e.g. "Kp7m-Qx3r-Tn9w" (no ambiguous characters)
function tempPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)].map((c) => c.join('')).join('-');
}

async function load(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid id');
  const user = await User.findById(id);
  if (!user) throw new HttpError(404, 'User not found');
  return user;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { role, status, q } = req.query;
    const filter = {};
    if (role && ROLES.includes(role)) filter.role = role;
    if (status && USER_STATUSES.includes(status)) filter.status = status;
    if (q) {
      const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { branch: rx }, { employeeId: rx }, { phone: rx }];
    }
    const users = await User.find(filter).sort({ status: 1, name: 1 }).populate('createdBy', 'name').lean();
    const stats = await evaluatorStats({ evaluatorIds: users.map((u) => u._id) });
    const counts = await User.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
    res.json({
      items: users.map(({ password, __v, ...u }) => ({ ...u, stats: stats.get(String(u._id)) || EMPTY_STATS })),
      counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = await load(req.params.id);
    await user.populate([{ path: 'createdBy', select: 'name' }, { path: 'approvedBy', select: 'name' }]);
    const stats = (await evaluatorStats({ evaluatorIds: [user._id] })).get(String(user._id)) || EMPTY_STATS;
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [activity, activeDays] = await Promise.all([
      ActivityLog.find({ actor: user._id }).sort({ createdAt: -1 }).limit(50).lean(),
      ActivityLog.aggregate([
        { $match: { actor: user._id, createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '+05:30' } }, n: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);
    res.json({ user, stats, activity, activeDays });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, email, role = 'evaluator', branch, employeeId, phone } = req.body || {};
    if (!name || !email) throw new HttpError(400, 'Name and email are required');
    if (!ROLES.includes(role)) throw new HttpError(400, 'Invalid role');
    if (await User.exists({ email: String(email).toLowerCase().trim() })) throw new HttpError(409, 'Email already registered');

    const password = tempPassword();
    const user = await User.create({
      name, email, role, branch, employeeId, phone, password,
      status: 'active', mustChangePassword: true, createdBy: req.user._id, approvedBy: req.user._id, approvedAt: new Date(),
    });
    await logActivity(req, 'user.created', { entityType: 'user', entityId: user._id, summary: `Created ${role} ${user.name}`, meta: { email: user.email, role } });
    // The temporary password is shown once to the superadmin and never stored in plain text
    res.status(201).json({ user, tempPassword: password });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = await load(req.params.id);
    const updates = pick(req.body);
    if (updates.role && !ROLES.includes(updates.role)) throw new HttpError(400, 'Invalid role');
    if (updates.status && !USER_STATUSES.includes(updates.status)) throw new HttpError(400, 'Invalid status');
    if (String(user._id) === String(req.user._id) && ((updates.role && updates.role !== user.role) || (updates.status && updates.status !== 'active'))) {
      throw new HttpError(409, 'You cannot change your own role or disable your own account');
    }

    const before = { status: user.status, role: user.role };
    Object.assign(user, updates);
    if (before.status !== 'active' && user.status === 'active' && !user.approvedAt) {
      user.approvedBy = req.user._id;
      user.approvedAt = new Date();
    }
    await user.save();

    let action = 'user.updated';
    if (before.status !== user.status) action = user.status === 'disabled' ? 'user.disabled' : before.status === 'pending' ? 'user.approved' : 'user.enabled';
    const verb = { 'user.disabled': 'Disabled', 'user.approved': 'Approved', 'user.enabled': 'Re-enabled', 'user.updated': 'Updated' }[action];
    await logActivity(req, action, { entityType: 'user', entityId: user._id, summary: `${verb} ${user.name}`, meta: { changes: updates, before } });
    res.json(user);
  })
);

router.post(
  '/:id/reset-password',
  asyncHandler(async (req, res) => {
    const user = await load(req.params.id);
    const password = tempPassword();
    user.password = password;
    user.mustChangePassword = true;
    await user.save();
    await logActivity(req, 'user.password_reset', { entityType: 'user', entityId: user._id, summary: `Reset password for ${user.name}` });
    res.json({ tempPassword: password });
  })
);

export default router;
