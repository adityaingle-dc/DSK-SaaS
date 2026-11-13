import { Router } from 'express';
import mongoose from 'mongoose';
import { catalog, sanitize, validate, computeValuation, REPORT_TEMPLATES } from '@dsk/shared';
import Valuation from '../models/Valuation.js';
import { protect, requireReviewer, requireSuperadmin } from '../middleware/auth.js';
import { isReviewer } from '../models/User.js';
import { logActivity, valuationMeta } from '../services/activity.js';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { removeForValuation, syncAttachments } from '../services/attachments.js';

const router = Router();

// Master data (option lists, amenity rate tables, purposes…) – the form schema itself ships in @dsk/shared
router.get('/catalog', (_req, res) => res.json({ catalog, reportTemplates: REPORT_TEMPLATES }));

router.use(protect);

// Stateless calculation – lets a client preview results with the server's engine (e.g. older mobile builds)
router.post('/calculate', (req, res) => {
  const data = sanitize(req.body?.data);
  res.json({ results: computeValuation(data), errors: validate(data) });
});

const scope = (user) => (isReviewer(user) ? {} : { evaluator: user._id });
const label = (v) => `${v.referenceNo}${v.summary?.applicantName ? ` (${v.summary.applicantName})` : ''}`;

async function load(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid id');
  const v = await Valuation.findOne({ _id: req.params.id, ...scope(req.user) })
    .populate('evaluator', 'name email branch')
    .populate('reviewedBy', 'name email')
    .populate('reportEditedBy', 'name');
  if (!v) throw new HttpError(404, 'Valuation not found');
  return v;
}

// Sanitise + validate incoming sheet; submit enforces required fields
function prepare(body, submit) {
  const data = sanitize(body?.data);
  const errors = validate(data, { mode: submit ? 'submit' : 'draft' });
  if (errors.length) {
    const err = new HttpError(422, submit ? 'Please complete the required fields before submitting' : 'Some values are invalid');
    err.details = errors;
    throw err;
  }
  return data;
}

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const match = scope(req.user);
    const [byStatus, byTemplate, totals] = await Promise.all([
      Valuation.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Valuation.aggregate([
        { $match: match },
        { $group: { _id: '$summary.reportTemplate', count: { $sum: 1 }, value: { $sum: '$summary.fairMarketValue' } } },
        { $sort: { count: -1 } },
      ]),
      Valuation.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: 1 }, value: { $sum: '$summary.fairMarketValue' } } }]),
    ]);
    res.json({
      total: totals[0]?.total || 0,
      totalValue: totals[0]?.value || 0,
      byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])),
      byTemplate: byTemplate.map((t) => ({ ...t, title: REPORT_TEMPLATES[t._id]?.title || t._id })),
    });
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, template, q, evaluator, page = 1, limit = 20 } = req.query;
    const filter = { ...scope(req.user) };
    if (evaluator && isReviewer(req.user) && mongoose.isValidObjectId(evaluator)) filter.evaluator = evaluator;
    if (status) filter.status = String(status);
    if (template) filter['summary.reportTemplate'] = String(template);
    if (q) {
      const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ 'summary.applicantName': rx }, { 'summary.phone': rx }, { referenceNo: rx }, { 'summary.branch': rx }, { 'summary.district': rx }];
    }
    const pageNum = Math.max(1, Number(page) || 1);
    const lim = Math.min(100, Math.max(1, Number(limit) || 20));
    const [items, total] = await Promise.all([
      Valuation.find(filter)
        .sort({ updatedAt: -1 })
        .skip((pageNum - 1) * lim)
        .limit(lim)
        .select('referenceNo summary status updatedAt evaluator')
        .populate('evaluator', 'name'),
      Valuation.countDocuments(filter),
    ]);
    res.json({ items, total, page: pageNum, pages: Math.ceil(total / lim) });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const submit = req.body?.status === 'submitted';
    const v = new Valuation({ data: prepare(req.body, submit), evaluator: req.user._id });
    if (submit) {
      v.status = 'submitted';
      v.submittedAt = new Date();
    }
    await syncAttachments(v, req.user);
    v.recompute();
    await v.save();
    await logActivity(req, 'valuation.created', { entityType: 'valuation', entityId: v._id, summary: `Created valuation ${label(v)}`, meta: valuationMeta(v) });
    if (submit) await logActivity(req, 'valuation.submitted', { entityType: 'valuation', entityId: v._id, summary: `Submitted ${label(v)} for review`, meta: valuationMeta(v) });
    res.status(201).json(v);
  })
);

router.get('/:id', asyncHandler(async (req, res) => res.json(await load(req))));

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const v = await load(req);
    if (!isReviewer(req.user) && !['draft', 'rejected'].includes(v.status)) {
      throw new HttpError(409, 'Only draft or rejected valuations can be edited');
    }
    const submit = req.body?.status === 'submitted';
    v.data = prepare(req.body, submit || v.status === 'submitted');
    const newlySubmitted = submit && v.status !== 'submitted';
    if (newlySubmitted) {
      v.status = 'submitted';
      v.submittedAt = new Date();
    }
    await syncAttachments(v, req.user);
    v.recompute();
    await v.save();
    await logActivity(req, newlySubmitted ? 'valuation.submitted' : 'valuation.updated', {
      entityType: 'valuation', entityId: v._id, meta: valuationMeta(v),
      summary: newlySubmitted ? `Submitted ${label(v)} for review` : `Saved changes to ${label(v)}`,
    });
    res.json(v);
  })
);

router.patch(
  '/:id/review',
  requireReviewer,
  asyncHandler(async (req, res) => {
    const { decision, note } = req.body || {};
    if (!['approved', 'rejected'].includes(decision)) throw new HttpError(400, 'decision must be approved or rejected');
    const v = await load(req);
    if (v.status !== 'submitted') throw new HttpError(409, 'Only submitted valuations can be reviewed');
    Object.assign(v, { status: decision, reviewNote: note ? String(note).slice(0, 2000) : undefined, reviewedBy: req.user._id, reviewedAt: new Date() });
    await v.save();
    await logActivity(req, `valuation.${decision}`, {
      entityType: 'valuation', entityId: v._id, meta: { ...valuationMeta(v), evaluatorId: v.evaluator?._id, evaluatorName: v.evaluator?.name, note: v.reviewNote },
      summary: `${decision === 'approved' ? 'Approved' : 'Rejected'} ${label(v)} by ${v.evaluator?.name || 'evaluator'}`,
    });
    res.json(await v.populate('reviewedBy', 'name email'));
  })
);

// Superadmin: save edits made on the printable bank report (wording / figures per report)
const OVERRIDE_KEY = /^[A-Za-z0-9_.-]{1,80}$/;
router.put(
  '/:id/report',
  requireSuperadmin,
  asyncHandler(async (req, res) => {
    const input = req.body?.overrides;
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'overrides must be an object');
    const entries = Object.entries(input);
    if (entries.length > 1000) throw new HttpError(400, 'Too many edited fields');
    const overrides = {};
    for (const [k, val] of entries) {
      if (!OVERRIDE_KEY.test(k) || typeof val !== 'string') throw new HttpError(400, `Invalid field "${String(k).slice(0, 40)}"`);
      overrides[k] = val.slice(0, 5000);
    }
    const v = await load(req);
    const before = Object.keys(v.reportOverrides || {}).length;
    v.reportOverrides = overrides;
    v.reportEditedBy = req.user._id;
    v.reportEditedAt = new Date();
    v.markModified('reportOverrides');
    await v.save();
    await logActivity(req, 'valuation.report_edited', {
      entityType: 'valuation', entityId: v._id, meta: { ...valuationMeta(v), editedFields: Object.keys(overrides).length, previously: before },
      summary: `Edited bank report for ${label(v)} (${Object.keys(overrides).length} field${Object.keys(overrides).length === 1 ? '' : 's'} changed)`,
    });
    res.json({ reportOverrides: v.reportOverrides, reportEditedAt: v.reportEditedAt, reportEditedBy: { _id: req.user._id, name: req.user.name } });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const v = await load(req);
    if (!isReviewer(req.user) && v.status !== 'draft') throw new HttpError(409, 'Only drafts can be deleted');
    await removeForValuation(v._id);
    await v.deleteOne();
    await logActivity(req, 'valuation.deleted', { entityType: 'valuation', entityId: v._id, summary: `Deleted ${label(v)}`, meta: valuationMeta(v) });
    res.status(204).end();
  })
);

export default router;
