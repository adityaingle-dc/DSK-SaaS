import jwt from 'jsonwebtoken';
import User, { isReviewer, isSuperadmin } from '../models/User.js';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';

export const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const ACTIVE_TOUCH_MS = 5 * 60 * 1000;

// Bearer token auth — works the same for the web app and the future mobile app.
// Status is re-checked on every request, so disabling a user takes effect immediately.
export const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Not authenticated');

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }

  const user = await User.findById(payload.id);
  if (!user) throw new HttpError(401, 'User not found');
  if (user.status !== 'active') throw new HttpError(401, user.status === 'pending' ? 'Account awaiting approval' : 'Account disabled');
  req.user = user;

  // "last active" for the superadmin's team view (throttled to one write per 5 minutes)
  if (!user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > ACTIVE_TOUCH_MS) {
    User.updateOne({ _id: user._id }, { $set: { lastActiveAt: new Date() } }).catch(() => {});
  }
  next();
});

export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user?.role)) return next(new HttpError(403, 'Forbidden'));
  next();
};

export const requireReviewer = (req, _res, next) => (isReviewer(req.user) ? next() : next(new HttpError(403, 'Forbidden')));
export const requireSuperadmin = (req, _res, next) => (isSuperadmin(req.user) ? next() : next(new HttpError(403, 'Forbidden')));
