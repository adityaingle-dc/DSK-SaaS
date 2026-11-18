import { Router } from 'express';
import mongoose from 'mongoose';
import { bankByCode, catalog, IFSC_RX, sanitize, validate, computeValuation, propertyAddress, REPORT_TEMPLATES } from '@dsk/shared';
import Valuation from '../models/Valuation.js';
import { protect, requireSuperadmin } from '../middleware/auth.js';
import User, { isReviewer, isSuperadmin } from '../models/User.js';
import { options, paging, searchDigits, searchRx, sorting } from '../utils/listQuery.js';
import { logActivity, valuationMeta } from '../services/activity.js';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { removeForValuation, syncAttachments } from '../services/attachments.js';
import { linkCustomer } from '../services/customers.js';

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
// customer contact details shared with whoever is working on the valuation (evaluators only ever load their own sheets)
const CUSTOMER_CONTACT = 'code contactType pocName pocPhone pocRole serviceRequest salutation name phone1 phone2 email houseNo street locality district pincode bankName branch notes';
const label = (v) => `${v.referenceNo}${v.summary?.applicantName ? ` (${v.summary.applicantName})` : ''}`;

async function load(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid id');
  const v = await Valuation.findOne({ _id: req.params.id, ...scope(req.user) })
    .populate('evaluator', 'name email branch')
    .populate('reviewedBy', 'name email')
    .populate('reportEditedBy', 'name')
    .populate('customer', CUSTOMER_CONTACT);
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

// Optional period filter on the date a valuation was created.
// `from` (inclusive) and `to` (exclusive) are ISO timestamps computed in the user's browser,
// so "today" / "this month" follow the user's local calendar, not the server's time zone.
function createdRange(query) {
  const range = {};
  const from = query.from ? new Date(String(query.from)) : null;
  const to = query.to ? new Date(String(query.to)) : null;
  if (from && !Number.isNaN(from.getTime())) range.$gte = from;
  if (to && !Number.isNaN(to.getTime())) range.$lt = to;
  return Object.keys(range).length ? { createdAt: range } : {};
}

// The signed-in user's own work, grouped for the evaluator dashboard
router.get(
  '/tasks',
  asyncHandler(async (req, res) => {
    const rows = await Valuation.find({ evaluator: req.user._id })
      .sort({ updatedAt: -1 })
      .select('referenceNo status summary data.property customer assignedBy assignedAt startedAt submittedAt reviewNote reviewedAt reviewedBy createdAt updatedAt')
      .populate('customer', CUSTOMER_CONTACT)
      .populate('assignedBy', 'name')
      .populate('reviewedBy', 'name')
      .lean();
    const task = (v) => ({
      _id: v._id,
      referenceNo: v.referenceNo,
      status: v.status,
      stage: v.status === 'rejected' ? 'returned' : v.status === 'draft' ? (v.startedAt ? 'inProgress' : 'new') : v.status,
      applicantName: v.summary?.applicantName || v.customer?.name || '',
      customer: v.customer || null,
      property: propertyAddress(v.data?.property || {}),
      // where the evaluator has to go
      site: {
        address: propertyAddress(v.data?.property || {}),
        landmark: v.data?.property?.landmark || '',
        location: v.data?.property?.location || null,
      },
      propertyDescription: v.data?.property?.description || '',
      bankName: v.summary?.bankName,
      branch: v.summary?.branch,
      reportTemplate: v.summary?.reportTemplate,
      fairMarketValue: v.summary?.fairMarketValue,
      assignedBy: v.assignedBy?.name || null,
      assignedAt: v.assignedAt || v.createdAt,
      startedAt: v.startedAt,
      submittedAt: v.submittedAt,
      reviewNote: v.reviewNote,
      reviewedBy: v.reviewedBy?.name || null,
      reviewedAt: v.reviewedAt,
      updatedAt: v.updatedAt,
    });
    const all = rows.map(task);
    const by = (stage) => all.filter((t) => t.stage === stage);
    const oldestFirst = (list, key) => list.sort((a, b) => new Date(a[key]) - new Date(b[key]));
    const returned = oldestFirst(by('returned'), 'reviewedAt');
    const fresh = oldestFirst(by('new'), 'assignedAt');
    const inProgress = oldestFirst(by('inProgress'), 'assignedAt');
    const submitted = by('submitted');
    const approved = by('approved');
    res.json({
      counts: { new: fresh.length, inProgress: inProgress.length, returned: returned.length, submitted: submitted.length, approved: approved.length },
      todo: [...returned, ...fresh, ...inProgress], // what needs action, most urgent first
      submitted,
      completed: approved.slice(0, 5),
    });
  })
);

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const match = { ...scope(req.user), ...createdRange(req.query) };
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
    const { status, template, q, evaluator, bank } = req.query;
    // whitelisted sort keys; default is most recently updated first
    const sortSpec = sorting(req.query, { updated: 'updatedAt', applicant: 'summary.applicantName', value: 'summary.fairMarketValue', created: 'createdAt' });
    const base = scope(req.user);
    const filter = { ...base, ...createdRange(req.query) };
    if (evaluator && isReviewer(req.user) && mongoose.isValidObjectId(evaluator)) filter.evaluator = evaluator;
    if (status) filter.status = String(status);
    if (template) filter['summary.reportTemplate'] = String(template);
    if (bank) filter['summary.bankName'] = String(bank);
    const rx = searchRx(q);
    if (rx) {
      filter.$or = [
        { 'summary.applicantName': rx }, { 'summary.phone': rx }, { referenceNo: rx }, { 'summary.bankName': rx }, { 'summary.branch': rx },
        { 'summary.district': rx }, { 'summary.propertyType': rx }, { 'summary.loanType': rx }, { 'data.property.village': rx }, { 'data.property.street': rx },
      ];
      const digits = searchDigits(q, 4);
      if (digits) filter.$or.push({ 'summary.phone': new RegExp(digits) });
    }
    const { page, limit, skip } = paging(req.query);
    const [items, total, banks, evaluatorIds] = await Promise.all([
      Valuation.find(filter).sort(sortSpec).skip(skip).limit(limit).select('referenceNo summary status updatedAt createdAt evaluator').populate('evaluator', 'name'),
      Valuation.countDocuments(filter),
      Valuation.distinct('summary.bankName', base),
      isReviewer(req.user) ? Valuation.distinct('evaluator', base) : [],
    ]);
    // options for the filter dropdowns (only values that exist in the user's own scope)
    const evaluators = evaluatorIds.length ? await User.find({ _id: { $in: evaluatorIds } }).select('name').sort({ name: 1 }).lean() : [];
    res.json({ items, total, page, pages: Math.ceil(total / limit), facets: { banks: options(banks), evaluators } });
  })
);

// Only the superadmin starts a valuation (evaluators work on sheets assigned to them from Customers)
router.post(
  '/',
  requireSuperadmin,
  asyncHandler(async (req, res) => {
    const approve = req.body?.status === 'approved';
    const submit = approve || req.body?.status === 'submitted';
    const v = new Valuation({ data: prepare(req.body, submit), evaluator: req.user._id, assignedBy: req.user._id, assignedAt: new Date(), startedAt: new Date() });
    if (approve) Object.assign(v, { status: 'approved', submittedAt: new Date(), reviewedBy: req.user._id, reviewedAt: new Date() });
    else if (submit) {
      v.status = 'submitted';
      v.submittedAt = new Date();
    }
    await syncAttachments(v, req.user);
    v.recompute();
    await linkCustomer(v, req.user);
    await v.save();
    await logActivity(req, 'valuation.created', { entityType: 'valuation', entityId: v._id, summary: `Created input sheet ${label(v)}`, meta: valuationMeta(v) });
    if (approve) await logActivity(req, 'valuation.approved', { entityType: 'valuation', entityId: v._id, summary: `Approved ${label(v)}`, meta: valuationMeta(v) });
    else if (submit) await logActivity(req, 'valuation.submitted', { entityType: 'valuation', entityId: v._id, summary: `Submitted ${label(v)} for review`, meta: valuationMeta(v) });
    res.status(201).json(v);
  })
);

// IFSC → bank + branch (public RBI data via Razorpay's IFSC service), cached in memory
const IFSC_CACHE = new Map();
const titleCase = (s) => String(s || '').toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\s+/g, ' ').trim();
router.get(
  '/ifsc/:code',
  asyncHandler(async (req, res) => {
    const code = String(req.params.code || '').toUpperCase().trim();
    if (!IFSC_RX.test(code)) throw new HttpError(400, 'IFSC format: ABCD0123456');
    if (IFSC_CACHE.has(code)) return res.json(IFSC_CACHE.get(code));
    let r;
    try {
      r = await fetch(`https://ifsc.razorpay.com/${code}`, { signal: AbortSignal.timeout(6000) });
    } catch {
      throw new HttpError(503, 'IFSC lookup is unavailable right now. Enter the bank and branch manually.');
    }
    if (r.status === 404) throw new HttpError(404, 'No bank branch found for this IFSC');
    if (!r.ok) throw new HttpError(503, 'IFSC lookup is unavailable right now. Enter the bank and branch manually.');
    const d = await r.json();
    const known = bankByCode(code);
    const out = {
      ifsc: code,
      bankCode: d.BANKCODE || code.slice(0, 4),
      bank: known?.name || d.BANK || '',
      branch: titleCase(d.BRANCH),
      address: d.ADDRESS || '',
      city: titleCase(d.CITY),
      district: titleCase(d.DISTRICT),
      state: titleCase(d.STATE),
      micr: d.MICR || '',
    };
    if (IFSC_CACHE.size > 5000) IFSC_CACHE.clear();
    IFSC_CACHE.set(code, out);
    res.json(out);
  })
);

router.get('/:id', asyncHandler(async (req, res) => res.json(await load(req))));

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const v = await load(req);
    if (!isReviewer(req.user) && !['draft', 'rejected'].includes(v.status)) {
      throw new HttpError(409, 'Only draft or returned input sheets can be edited');
    }
    const approve = req.body?.status === 'approved';
    if (approve && !isSuperadmin(req.user)) throw new HttpError(403, 'Only the superadmin can approve');
    const submit = req.body?.status === 'submitted';
    v.data = prepare(req.body, approve || submit || ['submitted', 'approved'].includes(v.status));
    if (!v.startedAt && String(v.evaluator?._id || v.evaluator) === String(req.user._id)) v.startedAt = new Date();
    const newlyApproved = approve && v.status !== 'approved';
    if (newlyApproved) Object.assign(v, { status: 'approved', submittedAt: v.submittedAt || new Date(), reviewedBy: req.user._id, reviewedAt: new Date(), reviewNote: undefined });
    const newlySubmitted = submit && !['submitted', 'approved'].includes(v.status);
    if (newlySubmitted) {
      v.status = 'submitted';
      v.submittedAt = new Date();
    }
    await syncAttachments(v, req.user);
    v.recompute();
    if (!v.customer) await linkCustomer(v, req.user);
    await v.save();
    await logActivity(req, newlyApproved ? 'valuation.approved' : newlySubmitted ? 'valuation.submitted' : 'valuation.updated', {
      entityType: 'valuation', entityId: v._id, meta: valuationMeta(v),
      summary: newlyApproved ? `Saved and approved ${label(v)}` : newlySubmitted ? `Submitted ${label(v)} for review` : `Saved changes to ${label(v)}`,
    });
    res.json(v);
  })
);

// Submitted sheets are reviewed (approved / returned) by the superadmin
router.patch(
  '/:id/review',
  requireSuperadmin,
  asyncHandler(async (req, res) => {
    const { decision, note } = req.body || {};
    if (!['approved', 'rejected'].includes(decision)) throw new HttpError(400, 'decision must be approved or rejected');
    const v = await load(req);
    if (v.status !== 'submitted') throw new HttpError(409, 'Only submitted input sheets can be reviewed');
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

// Jobs are assigned by the superadmin, so only the superadmin can delete one
router.delete(
  '/:id',
  requireSuperadmin,
  asyncHandler(async (req, res) => {
    const v = await load(req);
    await removeForValuation(v._id);
    await v.deleteOne();
    await logActivity(req, 'valuation.deleted', { entityType: 'valuation', entityId: v._id, summary: `Deleted ${label(v)}`, meta: valuationMeta(v) });
    res.status(204).end();
  })
);

export default router;
