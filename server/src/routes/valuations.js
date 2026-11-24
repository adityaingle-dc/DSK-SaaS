import { Router } from 'express';
import mongoose from 'mongoose';
import { bankByCode, findBank, catalog, IFSC_RX, sanitize, validate, computeValuation, propertyAddress, REPORT_TEMPLATES, DRAFTING_STATUSES, EVALUATOR_EDITABLE } from '@dsk/shared';
import { searchBranches } from '../services/ifscDirectory.js';
import { forwardGeocode, reverseGeocode } from '../services/geocode.js';
import Valuation from '../models/Valuation.js';
import { protect, requireSuperadmin } from '../middleware/auth.js';
import User, { isDrafter, isOffice, isReviewer } from '../models/User.js';
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

// who sees which sheets: the superadmin all · drafters every sheet handed in by an evaluator (the shared queue and
// what they draft) · an evaluator their own
const scope = (user) => (isReviewer(user) ? {} : isDrafter(user) ? { status: { $ne: 'draft' } } : { evaluator: user._id });
// customer contact details shared with whoever is working on the valuation
const CUSTOMER_CONTACT = 'code contactType pocName pocPhone pocRole serviceRequest salutation name phone1 phone2 email houseNo street locality district pincode bankName branch notes';
const label = (v) => `${v.referenceNo}${v.summary?.applicantName ? ` (${v.summary.applicantName})` : ''}`;
const idOf = (x) => String(x?._id || x || '');
const same = (a, b) => !!idOf(a) && idOf(a) === idOf(b);

async function load(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid id');
  const v = await Valuation.findOne({ _id: req.params.id, ...scope(req.user) })
    .populate('evaluator', 'name email branch')
    .populate('drafter', 'name email')
    .populate('reviewedBy', 'name email')
    .populate('receivedBy', 'name')
    .populate('returnedBy', 'name')
    .populate('approvedBy', 'name')
    .populate('reportEditedBy', 'name')
    .populate('basedOn', 'referenceNo status')
    .populate('customer', CUSTOMER_CONTACT);
  if (!v) throw new HttpError(404, 'Valuation not found');
  return v;
}

// Who may change the sheet now, or why not (null = allowed)
//  - evaluator: their own sheet while it is with them (draft / sent back to them)
//  - drafter: a sheet in the queue (opening or saving takes it) or one they are drafting
//  - superadmin: anything not approved yet
export function editBlock(v, user) {
  if (v.status === 'approved') return 'The report for this sheet has been approved, so the sheet is final and can no longer be changed.';
  if (isReviewer(user)) return null;
  if (isDrafter(user)) {
    if (v.status === 'pending') return "The report is waiting for the superadmin's approval. It can be changed again if they send it back.";
    if (!DRAFTING_STATUSES.includes(v.status)) return 'This sheet is back with the field evaluator.';
    if (v.drafter && !same(v.drafter, user._id)) return `${v.drafter?.name || 'Another drafter'} is drafting this sheet.`;
    return null;
  }
  if (!same(v.evaluator, user._id)) return 'This sheet is assigned to someone else.';
  // the evaluator drafting their own site inspection ("Start drafting"): like a drafter on this sheet
  if (v.drafter && same(v.drafter, user._id)) {
    if (v.status === 'pending') return "The report is waiting for the superadmin's approval. It can be changed again if they send it back.";
    if (DRAFTING_STATUSES.includes(v.status)) return null;
  }
  if (!EVALUATOR_EDITABLE.includes(v.status)) return 'You have submitted this site inspection, so it is with the drafter now. They can send it back to you if something is needed.';
  return null;
}

// a drafter takes a sheet from the queue (or one nobody has) by opening or saving it
async function claim(req, v) {
  if (!isDrafter(req.user) || v.drafter || !['submitted', 'received'].includes(v.status)) return false;
  const at = new Date();
  const r = await Valuation.updateOne(
    { _id: v._id, status: { $in: ['submitted', 'received'] }, $or: [{ drafter: null }, { drafter: { $exists: false } }] },
    { $set: { status: 'received', drafter: req.user._id, receivedAt: at, receivedBy: req.user._id } },
    { timestamps: false },
  );
  if (!r.modifiedCount) { // someone else took it a moment ago
    const now = await Valuation.findById(v._id).select('drafter status').populate('drafter', 'name');
    Object.assign(v, { drafter: now?.drafter, status: now?.status });
    return false;
  }
  v.status = 'received';
  v.drafter = req.user._id;
  v.receivedAt = at;
  v.receivedBy = req.user._id;
  await v.populate([{ path: 'drafter', select: 'name email' }, { path: 'receivedBy', select: 'name' }]);
  await logActivity(req, 'valuation.claimed', {
    entityType: 'valuation', entityId: v._id, meta: { ...valuationMeta(v), evaluatorName: v.evaluator?.name },
    summary: `Took ${label(v)} for drafting`,
  });
  return true;
}

// Sanitise + check the values entered (formats, options). Nothing is compulsory while the sheet is filled in:
// the whole sheet is checked when the report is generated.
function check(data) {
  const errors = validate(data, { mode: 'draft' });
  if (errors.length) {
    const err = new HttpError(422, 'Some values are invalid');
    err.details = errors;
    throw err;
  }
  return data;
}

// the sheet as sent to the app, with whether the signed-in user may change it now
const forUser = (v, user) => {
  const block = editBlock(v, user);
  return { ...v.toJSON(), canEdit: !block, editBlock: block || undefined };
};

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
      .select('referenceNo status service summary data.property customer assignedBy assignedAt startedAt submittedAt reviewNote reviewedAt reviewedBy receivedAt drafter reportedAt approvedAt createdAt updatedAt')
      .populate('customer', CUSTOMER_CONTACT)
      .populate('assignedBy', 'name')
      .populate('reviewedBy', 'name')
      .populate('drafter', 'name')
      .lean();
    const task = (v) => ({
      _id: v._id,
      referenceNo: v.referenceNo,
      status: v.status,
      service: v.service || '',
      // returned (sent back to the evaluator) · new · inProgress · submitted (in the drafters' queue) ·
      // drafting (a drafter has it, incl. the report waiting for approval) · approved
      stage: v.status === 'rejected' ? 'returned' : v.status === 'draft' ? (v.startedAt ? 'inProgress' : 'new')
        : v.status === 'submitted' ? 'submitted' : v.status === 'approved' ? 'approved' : 'drafting',
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
      drafter: v.drafter?.name || null,
      draftingMine: !!v.drafter && String(v.drafter._id) === String(req.user._id),
      reportedAt: v.reportedAt || null,
      approvedAt: v.approvedAt || null,
      updatedAt: v.updatedAt,
    });
    const all = rows.map(task);
    const by = (stage) => all.filter((t) => t.stage === stage);
    const oldestFirst = (list, key) => list.sort((a, b) => new Date(a[key]) - new Date(b[key]));
    const returned = oldestFirst(by('returned'), 'reviewedAt');
    const fresh = oldestFirst(by('new'), 'assignedAt');
    const inProgress = oldestFirst(by('inProgress'), 'assignedAt');
    const submitted = by('submitted');
    const drafting = by('drafting');
    const approved = by('approved');
    res.json({
      counts: { new: fresh.length, inProgress: inProgress.length, returned: returned.length, submitted: submitted.length, drafting: drafting.length, approved: approved.length },
      todo: [...returned, ...fresh, ...inProgress], // what needs action, most urgent first
      submitted, // in the drafters' queue
      drafting, // a drafter has it
      completed: approved.slice(0, 5),
    });
  })
);

// The drafter's work: the shared queue, what they are drafting, what came back from the superadmin, reports
// waiting for approval and recently approved. The superadmin sees everyone's.
router.get(
  '/drafting',
  asyncHandler(async (req, res) => {
    if (!isOffice(req.user)) throw new HttpError(403, 'Forbidden');
    const mine = isDrafter(req.user) ? { drafter: req.user._id } : {};
    const fields = 'referenceNo status service summary evaluator drafter submittedAt receivedAt reportedAt returnNote returnedAt approvedAt draftReady draftMissing updatedAt';
    const q = (filter, sort, limit = 50) => Valuation.find(filter).sort(sort).limit(limit).select(fields).populate('evaluator', 'name').populate('drafter', 'name').lean();
    const [queue, drafting, returned, pending, approved] = await Promise.all([
      q({ $or: [{ status: 'submitted' }, { status: 'received', drafter: null }] }, { submittedAt: 1 }),
      q({ status: 'received', drafter: { $ne: null }, ...mine }, { receivedAt: 1 }),
      q({ status: 'returned', ...mine }, { returnedAt: 1 }),
      q({ status: 'pending', ...mine }, { reportedAt: 1 }),
      q({ status: 'approved', ...mine }, { approvedAt: -1 }, 5),
    ]);
    res.json({
      counts: { queue: queue.length, drafting: drafting.length, returned: returned.length, pending: pending.length },
      queue, drafting, returned, pending, approved,
    });
  })
);

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const match = { ...scope(req.user), ...createdRange(req.query) };
    const [byStatus, byTemplate, totals, queued, drafting] = await Promise.all([
      Valuation.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Valuation.aggregate([
        { $match: match },
        { $group: { _id: '$summary.reportTemplate', count: { $sum: 1 }, value: { $sum: '$summary.fairMarketValue' } } },
        { $sort: { count: -1 } },
      ]),
      Valuation.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: 1 }, value: { $sum: '$summary.fairMarketValue' } } }]),
      Valuation.countDocuments({ ...match, status: 'submitted' }),
      Valuation.countDocuments({ ...match, status: { $in: ['received', 'returned'] } }),
    ]);
    res.json({
      total: totals[0]?.total || 0,
      totalValue: totals[0]?.value || 0,
      byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])),
      drafts: { queue: queued, drafting }, // with the drafters
      byTemplate: byTemplate.map((t) => ({ ...t, title: REPORT_TEMPLATES[t._id]?.title || t._id })),
    });
  })
);

// Search + filters shared by the list and the board (everything except the status tab)
function listFilter(req) {
  const { template, q, evaluator, bank, drafter } = req.query;
  const base = scope(req.user);
  const filter = { ...base, ...createdRange(req.query) };
  if (evaluator && isReviewer(req.user) && mongoose.isValidObjectId(evaluator)) filter.evaluator = evaluator;
  if (drafter === 'me') filter.drafter = req.user._id;
  else if (drafter && isReviewer(req.user) && mongoose.isValidObjectId(drafter)) filter.drafter = drafter;
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
// new / inProgress / rejected: with the evaluator · submitted: drafters' queue · received: drafting (incl. sent back
// by the superadmin) · pending: report waiting for approval · approved
const BOARD_COLUMNS = {
  new: { status: 'draft', startedAt: null },
  inProgress: { status: 'draft', startedAt: { $ne: null } },
  rejected: { status: 'rejected' },
  submitted: { status: 'submitted' },
  received: { status: { $in: ['received', 'returned'] } },
  pending: { status: 'pending' },
  approved: { status: 'approved' },
};
const BOARD_LIMIT = 60; // per column; the count shows how many there are in total
router.get(
  '/board',
  asyncHandler(async (req, res) => {
    const { filter } = listFilter(req);
    const fields = 'referenceNo summary status updatedAt createdAt startedAt submittedAt reviewedAt assignedAt reportedAt returnedAt evaluator drafter';
    const keys = Object.keys(BOARD_COLUMNS);
    const results = await Promise.all(keys.map((k) => {
      const f = { ...filter, ...BOARD_COLUMNS[k] };
      return Promise.all([
        Valuation.find(f).sort({ updatedAt: -1 }).limit(BOARD_LIMIT).select(fields).populate('evaluator', 'name').populate('drafter', 'name').lean(),
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
      Valuation.find(filter).sort(sortSpec).skip(skip).limit(limit).select('referenceNo service summary status updatedAt createdAt evaluator drafter draftReady draftMissing submittedAt receivedAt reportedAt returnedAt approvedAt').populate('evaluator', 'name').populate('drafter', 'name'),
      Valuation.countDocuments(filter),
      Valuation.distinct('summary.bankName', base),
      isReviewer(req.user) ? Valuation.distinct('evaluator', base) : [],
    ]);
    // options for the filter dropdowns (only values that exist in the user's own scope)
    const evaluators = evaluatorIds.length ? await User.find({ _id: { $in: evaluatorIds } }).select('name').sort({ name: 1 }).lean() : [];
    res.json({ items, total, page, pages: Math.ceil(total / limit), facets: { banks: options(banks), evaluators } });
  })
);

// The superadmin can start a blank sheet of their own (jobs normally start from Customers)
router.post(
  '/',
  requireSuperadmin,
  asyncHandler(async (req, res) => {
    const v = new Valuation({ data: check(sanitize(req.body?.data)), evaluator: req.user._id, assignedBy: req.user._id, assignedAt: new Date(), startedAt: new Date() });
    await syncAttachments(v, req.user);
    v.recompute();
    await linkCustomer(v, req.user);
    await v.save();
    await logActivity(req, 'valuation.created', { entityType: 'valuation', entityId: v._id, summary: `Created input sheet ${label(v)}`, meta: valuationMeta(v) });
    res.status(201).json(forUser(v, req.user));
  })
);

// bank name + branch / area → matching branches with their IFSC (Razorpay's public IFSC dataset, kept on disk)
// map point → address parts for the Property location section (OpenStreetMap; nothing stored)
// address → map point, to show the site address typed in Add customer on a map (OpenStreetMap; nothing stored)
router.get(
  '/geocode',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 3) throw new HttpError(400, 'Type the site address first');
    try {
      res.json({ result: await forwardGeocode(q) });
    } catch (e) {
      console.warn('[geocode] search unavailable:', e.message);
      throw new HttpError(503, e.userMessage || 'The map search is unavailable right now. Tap the site on the map instead.');
    }
  })
);

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
      throw new HttpError(503, e.userMessage || 'Address lookup is unavailable right now. Fill the address manually.');
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

// Open a sheet. A drafter opening a sheet from the queue takes it (the evaluator then sees "Drafting by …").
// canEdit / editBlock: whether the signed-in user may change it now, and why not.
router.get('/:id', asyncHandler(async (req, res) => {
  const v = await load(req);
  await claim(req, v);
  res.json(forUser(v, req.user));
}));

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const v = await load(req);
    await claim(req, v);
    const block = editBlock(v, req.user);
    if (block) throw new HttpError(409, block);
    // submit: the evaluator hands the site inspection to the drafters (nothing is compulsory)
    const submit = req.body?.status === 'submitted' && EVALUATOR_EDITABLE.includes(v.status);
    const incoming = sanitize(req.body?.data);
    // fields filled from the customer and locked on the sheet keep their saved value
    for (const path of v.lockedFields || []) {
      const [sec, key] = path.split('.');
      const saved = v.data?.[sec]?.[key];
      incoming[sec] = { ...(incoming[sec] || {}) };
      if (saved === undefined) delete incoming[sec][key]; else incoming[sec][key] = saved;
    }
    v.data = check(incoming);
    if (isOffice(req.user)) v.draftUpdatedAt = new Date();
    const own = same(v.evaluator, req.user._id);
    if (!v.startedAt && own) v.startedAt = new Date();
    if (submit) Object.assign(v, { status: 'submitted', submittedAt: new Date(), drafter: null, receivedAt: undefined, receivedBy: undefined });
    await syncAttachments(v, req.user);
    v.recompute();
    if (!v.customer) await linkCustomer(v, req.user);
    await v.save();
    await logActivity(req, submit ? 'valuation.submitted' : 'valuation.updated', {
      entityType: 'valuation', entityId: v._id, meta: valuationMeta(v),
      summary: submit ? `Submitted the site inspection ${label(v)} to the drafters` : `Saved changes to ${label(v)}`,
    });
    res.json(forUser(v, req.user));
  })
);

// The field evaluator drafts their own site inspection ("Start drafting"): the sheet is saved and goes straight to
// drafting with them as the drafter (it skips the drafters' queue). They complete the sheet and the report and
// generate it; the superadmin still approves it. The activity log records it under their name.
router.post(
  '/:id/start-drafting',
  asyncHandler(async (req, res) => {
    const v = await load(req);
    if (isOffice(req.user)) throw new HttpError(400, 'Open the sheet to draft it.');
    if (!same(v.evaluator, req.user._id)) throw new HttpError(403, 'Only the evaluator of this site inspection can start drafting it.');
    if (!EVALUATOR_EDITABLE.includes(v.status)) throw new HttpError(409, 'This site inspection is already with a drafter.');
    if (req.body?.data) v.data = check(sanitize(req.body.data));
    const at = new Date();
    Object.assign(v, { status: 'received', drafter: req.user._id, submittedAt: at, receivedAt: at, receivedBy: req.user._id, startedAt: v.startedAt || at, draftUpdatedAt: at });
    await syncAttachments(v, req.user);
    v.recompute();
    await v.save();
    await logActivity(req, 'valuation.claimed', {
      entityType: 'valuation', entityId: v._id, meta: { ...valuationMeta(v), evaluatorName: req.user.name, selfDrafted: true },
      summary: `Started drafting ${label(v)} (their own site inspection)`,
    });
    res.json(forUser(await load(req), req.user));
  })
);

// The drafter (or the superadmin) sends the site inspection back to the evaluator with a note
router.patch(
  '/:id/review',
  asyncHandler(async (req, res) => {
    const { decision, note } = req.body || {};
    if (decision !== 'rejected') throw new HttpError(400, 'Only sending back to the evaluator is done here. Reports are approved in Reports.');
    if (!isOffice(req.user)) throw new HttpError(403, 'Forbidden');
    const v = await load(req);
    if (!DRAFTING_STATUSES.includes(v.status)) throw new HttpError(409, 'Only a sheet with the drafters can be sent back to the evaluator');
    if (same(v.evaluator, req.user._id)) throw new HttpError(409, 'This is your own site inspection, so there is no evaluator to send it back to. Correct it yourself and generate the report.');
    if (isDrafter(req.user) && v.drafter && !same(v.drafter, req.user._id)) throw new HttpError(409, `${v.drafter?.name || 'Another drafter'} is drafting this sheet.`);
    if (!String(note || '').trim()) throw new HttpError(422, 'Say what the evaluator should fix');
    Object.assign(v, { status: 'rejected', reviewNote: String(note).trim().slice(0, 2000), reviewedBy: req.user._id, reviewedAt: new Date() });
    await v.save();
    await logActivity(req, 'valuation.rejected', {
      entityType: 'valuation', entityId: v._id, meta: { ...valuationMeta(v), evaluatorId: v.evaluator?._id, evaluatorName: v.evaluator?.name, note: v.reviewNote },
      summary: `Sent ${label(v)} back to ${v.evaluator?.name || 'the evaluator'}: ${v.reviewNote.slice(0, 80)}`,
    });
    res.json(forUser(await load(req), req.user));
  })
);

// Reuse a site inspection for another report (drafter / superadmin): a new sheet with the same data — site
// inspection, photos, documents and what was drafted — goes straight to drafting (no new site visit). The original
// sheet and its reports stay as they are. Change the bank, purpose or anything else in the new sheet and generate.
router.post(
  '/:id/reuse',
  asyncHandler(async (req, res) => {
    if (!isOffice(req.user)) throw new HttpError(403, 'Forbidden');
    const src = await load(req);
    if (['draft', 'rejected'].includes(src.status)) throw new HttpError(409, 'The site inspection has not been submitted yet, so it cannot be reused.');
    const data = JSON.parse(JSON.stringify(src.data || {}));
    const at = new Date();
    const v = new Valuation({
      data,
      service: src.service,
      customer: src.customer?._id || src.customer,
      evaluator: src.evaluator?._id || src.evaluator, // the site inspection is still theirs
      assignedBy: req.user._id, assignedAt: at, startedAt: src.startedAt || at, submittedAt: at,
      basedOn: src._id,
      sources: [...(src.sources || []), src._id],
      // a drafter who reuses it drafts it; the superadmin puts it in the drafters' queue
      ...(isDrafter(req.user) ? { status: 'received', drafter: req.user._id, receivedAt: at, receivedBy: req.user._id } : { status: 'submitted' }),
    });
    await syncAttachments(v, req.user);
    v.recompute();
    await v.save();
    await logActivity(req, 'valuation.created', {
      entityType: 'valuation', entityId: v._id, meta: { ...valuationMeta(v), basedOn: src.referenceNo },
      summary: `Started ${v.referenceNo} from the site inspection of ${label(src)} (for another report)`,
    });
    res.status(201).json({ _id: v._id, referenceNo: v.referenceNo, basedOn: src.referenceNo });
  })
);

// Superadmin: give a sheet to another drafter, or put it back in the queue (drafter: null)
router.patch(
  '/:id/drafter',
  requireSuperadmin,
  asyncHandler(async (req, res) => {
    const v = await load(req);
    if (!DRAFTING_STATUSES.includes(v.status)) throw new HttpError(409, 'Only a sheet with the drafters can be reassigned');
    const to = req.body?.drafter;
    let person = null;
    if (to) {
      if (!mongoose.isValidObjectId(to)) throw new HttpError(422, 'Choose a drafter');
      person = await User.findOne({ _id: to, status: 'active' });
      if (!person || !['drafter', 'superadmin', 'admin'].includes(person.role)) throw new HttpError(422, 'Choose an active drafter');
    }
    if (person) Object.assign(v, { drafter: person._id, status: v.status === 'submitted' ? 'received' : v.status, receivedAt: new Date(), receivedBy: person._id });
    else Object.assign(v, { drafter: null, status: v.status === 'returned' ? 'returned' : 'submitted', receivedAt: undefined, receivedBy: undefined });
    await v.save();
    await logActivity(req, 'valuation.drafter_changed', {
      entityType: 'valuation', entityId: v._id, meta: valuationMeta(v),
      summary: person ? `Gave ${label(v)} to ${person.name} for drafting` : `Put ${label(v)} back in the drafters' queue`,
    });
    res.json(forUser(await load(req), req.user));
  })
);

// Drafter / superadmin: report edits made before the report is generated (wording / figures)
const OVERRIDE_KEY = /^[A-Za-z0-9_.-]{1,80}$/;
router.put(
  '/:id/report',
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
    // office staff, or the evaluator drafting their own site inspection
    if (!isOffice(req.user) && !(v.drafter && same(v.drafter, req.user._id))) throw new HttpError(403, 'Forbidden');
    const block = editBlock(v, req.user);
    if (block) throw new HttpError(409, block);
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
    const reusing = await Valuation.find({ sources: v._id }).select('referenceNo').lean();
    if (reusing.length) throw new HttpError(409, `This site inspection is reused by ${reusing.map((x) => x.referenceNo).join(', ')}, so it can't be deleted.`);
    await removeForValuation(v._id);
    await v.deleteOne();
    await logActivity(req, 'valuation.deleted', { entityType: 'valuation', entityId: v._id, summary: `Deleted ${label(v)}`, meta: valuationMeta(v) });
    res.status(204).end();
  })
);

export default router;
