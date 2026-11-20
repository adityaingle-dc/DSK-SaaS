import { Router } from 'express';
import mongoose from 'mongoose';
import { bankByCode, findBank, catalog, IFSC_RX, sanitize, validate, computeValuation, propertyAddress, REPORT_TEMPLATES } from '@dsk/shared';
import { searchBranches } from '../services/ifscDirectory.js';
import { reverseGeocode } from '../services/geocode.js';
import Valuation, { EVALUATOR_EDITABLE } from '../models/Valuation.js';
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
    .populate('receivedBy', 'name')
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
      .select('referenceNo status summary data.property customer assignedBy assignedAt startedAt submittedAt reviewNote reviewedAt reviewedBy receivedAt receivedBy updatedAfterReceived reportedAt createdAt updatedAt')
      .populate('customer', CUSTOMER_CONTACT)
      .populate('assignedBy', 'name')
      .populate('reviewedBy', 'name')
      .populate('receivedBy', 'name')
      .lean();
    const task = (v) => ({
      _id: v._id,
      referenceNo: v.referenceNo,
      status: v.status,
      // submitted = in review (not opened by the superadmin yet) · received = with the superadmin (opened)
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
      receivedAt: v.receivedAt,
      receivedBy: v.receivedBy?.name || null,
      updatedAfterReceived: !!v.updatedAfterReceived,
      reportedAt: v.reportedAt || null,
      updatedAt: v.updatedAt,
    });
    const all = rows.map(task);
    const by = (stage) => all.filter((t) => t.stage === stage);
    const oldestFirst = (list, key) => list.sort((a, b) => new Date(a[key]) - new Date(b[key]));
    const returned = oldestFirst(by('returned'), 'reviewedAt');
    const fresh = oldestFirst(by('new'), 'assignedAt');
    const inProgress = oldestFirst(by('inProgress'), 'assignedAt');
    const submitted = by('submitted');
    const received = by('received');
    const approved = by('approved');
    res.json({
      counts: { new: fresh.length, inProgress: inProgress.length, returned: returned.length, submitted: submitted.length, received: received.length, approved: approved.length },
      todo: [...returned, ...fresh, ...inProgress], // what needs action, most urgent first
      submitted, // in review: not opened by the superadmin yet
      received, // with the superadmin: opened by them
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

// Search + filters shared by the list and the board (everything except the status tab)
function listFilter(req) {
  const { template, q, evaluator, bank } = req.query;
  const base = scope(req.user);
  const filter = { ...base, ...createdRange(req.query) };
  if (evaluator && isReviewer(req.user) && mongoose.isValidObjectId(evaluator)) filter.evaluator = evaluator;
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
  return { base, filter };
}

// Kanban board: the same search / filters, grouped into workflow columns.
// new = draft never opened by the evaluator · inProgress = draft being filled · submitted (not opened by the superadmin yet)
// · received (opened) · rejected (sent back) · approved (completed: report generated)
const BOARD_COLUMNS = {
  new: { status: 'draft', startedAt: null },
  inProgress: { status: 'draft', startedAt: { $ne: null } },
  submitted: { status: 'submitted' },
  received: { status: 'received' },
  rejected: { status: 'rejected' },
  approved: { status: 'approved' },
};
const BOARD_LIMIT = 60; // per column; the count shows how many there are in total
router.get(
  '/board',
  asyncHandler(async (req, res) => {
    const { filter } = listFilter(req);
    const fields = 'referenceNo summary status updatedAt createdAt startedAt submittedAt reviewedAt assignedAt evaluator';
    const keys = Object.keys(BOARD_COLUMNS);
    const results = await Promise.all(keys.map((k) => {
      const f = { ...filter, ...BOARD_COLUMNS[k] };
      return Promise.all([
        Valuation.find(f).sort({ updatedAt: -1 }).limit(BOARD_LIMIT).select(fields).populate('evaluator', 'name').lean(),
        Valuation.countDocuments(f),
      ]);
    }));
    const columns = Object.fromEntries(keys.map((k, i) => [k, { items: results[i][0], total: results[i][1] }]));
    res.json({ columns, limit: BOARD_LIMIT });
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    // whitelisted sort keys; default is most recently updated first
    const sortSpec = sorting(req.query, { updated: 'updatedAt', applicant: 'summary.applicantName', value: 'summary.fairMarketValue', created: 'createdAt' });
    const { base, filter } = listFilter(req);
    // one status, or several separated by commas (e.g. submitted,received = handed in, waiting for the report)
    if (status) {
      const list = String(status).split(',').map((x) => x.trim()).filter(Boolean);
      filter.status = list.length > 1 ? { $in: list } : list[0];
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
    // the superadmin's own sheet needs no review: "finish" makes it complete and ready for a report (received)
    const finish = ['received', 'approved'].includes(req.body?.status);
    const submit = finish || req.body?.status === 'submitted';
    const v = new Valuation({ data: prepare(req.body, submit), evaluator: req.user._id, assignedBy: req.user._id, assignedAt: new Date(), startedAt: new Date() });
    if (finish) Object.assign(v, { status: 'received', submittedAt: new Date(), receivedAt: new Date(), receivedBy: req.user._id });
    else if (submit) {
      v.status = 'submitted';
      v.submittedAt = new Date();
    }
    await syncAttachments(v, req.user);
    v.recompute();
    await linkCustomer(v, req.user);
    await v.save();
    await logActivity(req, 'valuation.created', { entityType: 'valuation', entityId: v._id, summary: `Created input sheet ${label(v)}`, meta: valuationMeta(v) });
    if (finish) await logActivity(req, 'valuation.completed', { entityType: 'valuation', entityId: v._id, summary: `Finished ${label(v)}: ready for a report`, meta: valuationMeta(v) });
    else if (submit) await logActivity(req, 'valuation.submitted', { entityType: 'valuation', entityId: v._id, summary: `Submitted ${label(v)} for review`, meta: valuationMeta(v) });
    res.status(201).json(v);
  })
);

// bank name + branch / area → matching branches with their IFSC (Razorpay's public IFSC dataset, kept on disk)
// map point → address parts for the Property location section (OpenStreetMap; nothing stored)
router.get(
  '/reverse-geocode',
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new HttpError(400, 'A valid map location is needed');
    try {
      res.json(await reverseGeocode(lat, lon));
    } catch (e) {
      console.warn('[geocode] unavailable:', e.message);
      throw new HttpError(503, 'Address lookup is unavailable right now. Fill the address manually.');
    }
  })
);

router.get(
  '/ifsc-search',
  asyncHandler(async (req, res) => {
    const bank = String(req.query.bank || '').trim().slice(0, 120);
    const q = String(req.query.q || '').trim().slice(0, 80);
    if (!bank) throw new HttpError(400, 'Enter the bank name first');
    if (q.length < 2) return res.json({ bankCode: null, bank: null, total: 0, items: [] });
    try {
      res.json(await searchBranches({ bank, knownCode: findBank(bank)?.code, q }));
    } catch (e) {
      console.warn('[ifsc] search unavailable:', e.message);
      throw new HttpError(503, 'Branch search is unavailable right now. Enter the IFSC or branch manually.');
    }
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

// The superadmin opening an evaluator's submitted sheet = received (the evaluator sees "Received by …")
router.get('/:id', asyncHandler(async (req, res) => {
  const v = await load(req);
  const own = String(v.evaluator?._id || v.evaluator) === String(req.user._id);
  if (isSuperadmin(req.user) && v.status === 'submitted' && !own) {
    const at = new Date();
    // not a change to the sheet itself: keep its "last updated" time
    await Valuation.updateOne({ _id: v._id }, { $set: { status: 'received', receivedAt: at, receivedBy: req.user._id } }, { timestamps: false });
    await logActivity(req, 'valuation.received', {
      entityType: 'valuation', entityId: v._id, meta: { ...valuationMeta(v), evaluatorId: v.evaluator?._id, evaluatorName: v.evaluator?.name },
      summary: `Received ${label(v)} from ${v.evaluator?.name || 'the evaluator'}`,
    });
    return res.json({ ...v.toJSON(), status: 'received', receivedAt: at, receivedBy: { _id: req.user._id, name: req.user.name } });
  }
  res.json(v);
}));

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const v = await load(req);
    // the evaluator can edit until a report has been generated from the sheet
    if (!isReviewer(req.user) && !EVALUATOR_EDITABLE.includes(v.status)) {
      throw new HttpError(409, 'A report has already been generated from this input sheet, so it can no longer be changed. Ask the superadmin if something needs correcting.');
    }
    // "finish" (superadmin): complete and ready for a report, no review step ('approved' from older screens means the same)
    const finish = ['received', 'approved'].includes(req.body?.status) && isSuperadmin(req.user);
    const submit = req.body?.status === 'submitted';
    const wasReceived = v.status === 'received';
    v.data = prepare(req.body, finish || submit || ['submitted', 'received', 'approved'].includes(v.status));
    const own = String(v.evaluator?._id || v.evaluator) === String(req.user._id);
    if (!v.startedAt && own) v.startedAt = new Date();
    const newlyFinished = finish && !['received', 'approved'].includes(v.status);
    if (newlyFinished) Object.assign(v, { status: 'received', submittedAt: v.submittedAt || new Date(), receivedAt: new Date(), receivedBy: req.user._id, reviewNote: undefined, updatedAfterReceived: false });
    const newlySubmitted = submit && ['draft', 'rejected'].includes(v.status);
    if (newlySubmitted) Object.assign(v, { status: 'submitted', submittedAt: new Date(), receivedAt: undefined, receivedBy: undefined, updatedAfterReceived: false });
    // the evaluator changed a sheet the superadmin had already opened: back to "submitted" so they see it again
    const changedAfterReceived = !newlySubmitted && !newlyFinished && wasReceived && own && !isSuperadmin(req.user);
    if (changedAfterReceived) Object.assign(v, { status: 'submitted', updatedAfterReceived: true, submittedAt: new Date() });
    await syncAttachments(v, req.user);
    v.recompute();
    if (!v.customer) await linkCustomer(v, req.user);
    await v.save();
    await logActivity(req, newlyFinished ? 'valuation.completed' : newlySubmitted ? 'valuation.submitted' : 'valuation.updated', {
      entityType: 'valuation', entityId: v._id, meta: valuationMeta(v),
      summary: newlyFinished ? `Finished ${label(v)}: ready for a report` : newlySubmitted ? `Submitted ${label(v)}`
        : changedAfterReceived ? `Updated ${label(v)} after the superadmin received it` : `Saved changes to ${label(v)}`,
    });
    res.json(v);
  })
);

// The superadmin can send a submitted / received sheet back to the evaluator with a note (there is no approval:
// generating the report completes the sheet)
router.patch(
  '/:id/review',
  requireSuperadmin,
  asyncHandler(async (req, res) => {
    const { decision, note } = req.body || {};
    if (decision !== 'rejected') throw new HttpError(400, 'Approval is no longer used: generate the report to complete the sheet. To ask for changes, send it back with a note.');
    const v = await load(req);
    if (!['submitted', 'received'].includes(v.status)) throw new HttpError(409, 'Only a submitted input sheet can be sent back');
    Object.assign(v, { status: decision, reviewNote: note ? String(note).slice(0, 2000) : undefined, reviewedBy: req.user._id, reviewedAt: new Date() });
    await v.save();
    await logActivity(req, `valuation.${decision}`, {
      entityType: 'valuation', entityId: v._id, meta: { ...valuationMeta(v), evaluatorId: v.evaluator?._id, evaluatorName: v.evaluator?.name, note: v.reviewNote },
      summary: `Sent ${label(v)} back to ${v.evaluator?.name || 'the evaluator'}${v.reviewNote ? `: ${v.reviewNote.slice(0, 80)}` : ''}`,
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
