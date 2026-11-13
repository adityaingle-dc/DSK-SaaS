import { Router } from 'express';
import mongoose from 'mongoose';
import ActivityLog, { ACTIONS } from '../models/ActivityLog.js';
import User from '../models/User.js';
import { protect, requireSuperadmin } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { EMPTY_STATS, evaluatorStats } from '../services/teamStats.js';

const router = Router();
router.use(protect, requireSuperadmin);

const parseDate = (v, endOfDay) => {
  if (!v) return undefined;
  const d = new Date(`${String(v).slice(0, 10)}T${endOfDay ? '23:59:59.999' : '00:00:00'}+05:30`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

function buildFilter(q) {
  const filter = {};
  if (q.actor && mongoose.isValidObjectId(q.actor)) filter.actor = new mongoose.Types.ObjectId(String(q.actor));
  if (q.action) {
    // exact action, or a group such as "valuation" / "auth"
    const a = String(q.action);
    filter.action = ACTIONS.includes(a) ? a : { $in: ACTIONS.filter((x) => x.startsWith(`${a}.`)) };
  }
  const from = parseDate(q.from);
  const to = parseDate(q.to, true);
  if (from || to) filter.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  if (q.q) {
    const rx = new RegExp(String(q.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ summary: rx }, { actorName: rx }, { 'meta.referenceNo': rx }, { 'meta.applicantName': rx }];
  }
  return filter;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = buildFilter(req.query);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const [items, total] = await Promise.all([
      ActivityLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      ActivityLog.countDocuments(filter),
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit), actions: ACTIONS });
  })
);

const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // prevent formula injection when opened in Excel
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

router.get(
  '/export.csv',
  asyncHandler(async (req, res) => {
    const rows = await ActivityLog.find(buildFilter(req.query)).sort({ createdAt: -1 }).limit(20000).lean();
    const header = ['Time (IST)', 'User', 'Role', 'Action', 'Summary', 'Reference', 'Applicant', 'Value (Rs)', 'IP', 'Device'];
    const fmt = (d) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
    const lines = [header, ...rows.map((r) => [fmt(r.createdAt), r.actorName, r.actorRole, r.action, r.summary, r.meta?.referenceNo, r.meta?.applicantName, r.meta?.fairMarketValue, r.ip, r.userAgent])];
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="activity-${new Date().toISOString().slice(0, 10)}.csv"` });
    res.send('﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n'));
  })
);

// Team performance report for a period
router.get(
  '/report',
  asyncHandler(async (req, res) => {
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to, true);
    const users = await User.find({ role: { $in: ['evaluator', 'admin'] } }).select('name email role status branch lastActiveAt lastLoginAt').lean();
    const stats = await evaluatorStats({ evaluatorIds: users.map((u) => u._id), from, to });
    const range = from || to ? { createdAt: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {};
    const [actionCounts, daily] = await Promise.all([
      ActivityLog.aggregate([{ $match: { ...range, actor: { $ne: null } } }, { $group: { _id: { actor: '$actor', action: '$action' }, n: { $sum: 1 } } }]),
      ActivityLog.aggregate([
        { $match: { ...range, action: { $in: ['valuation.created', 'valuation.submitted', 'valuation.approved', 'valuation.rejected'] } } },
        { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '+05:30' } }, action: '$action' }, n: { $sum: 1 } } },
        { $sort: { '_id.day': 1 } },
      ]),
    ]);
    const perUserActions = {};
    for (const c of actionCounts) (perUserActions[String(c._id.actor)] ||= {})[c._id.action] = c.n;

    const rows = users
      .map((u) => ({ ...u, stats: stats.get(String(u._id)) || EMPTY_STATS, actions: perUserActions[String(u._id)] || {} }))
      .sort((a, b) => b.stats.total - a.stats.total || a.name.localeCompare(b.name));
    const totals = rows.reduce(
      (t, r) => ({ total: t.total + r.stats.total, approved: t.approved + r.stats.approved, rejected: t.rejected + r.stats.rejected, submitted: t.submitted + r.stats.submitted, value: t.value + r.stats.totalValue }),
      { total: 0, approved: 0, rejected: 0, submitted: 0, value: 0 }
    );
    const series = {};
    for (const d of daily) (series[d._id.day] ||= { day: d._id.day })[d._id.action.split('.')[1]] = d.n;
    res.json({ rows, totals, daily: Object.values(series) });
  })
);

export default router;
