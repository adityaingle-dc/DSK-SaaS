import { Router } from 'express';
import mongoose from 'mongoose';
import { validate, propertyAddress, REPORT_TEMPLATES } from '@dsk/shared';
import Report, { REPORT_TYPES, REPORT_TYPE_KEYS, isApprovedReport } from '../models/Report.js';
import Valuation from '../models/Valuation.js';
import Customer from '../models/Customer.js';
import User, { isDrafter, isOffice, isSuperadmin } from '../models/User.js';
import { dateRange, options, paging, searchDigits, searchRx, sorting } from '../utils/listQuery.js';
import { protect, requireOffice, requireSuperadmin } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { logActivity } from '../services/activity.js';
import { nextId } from '../services/ids.js';

// Reports: the drafter completes the sheet and generates the report (a frozen, numbered copy: v1, v2…), which goes
// to the superadmin. The superadmin approves it (final: the report and the sheet are locked) or sends it back to the
// drafter with a note; the drafter then fixes the sheet / wording and generates the next version.
const router = Router();
router.use(protect);
// the evaluator who drafts their own site inspection may generate its report and open its reports; everything else is
// for office staff
const draftsIt = (user, v) => !!v?.drafter && String(v.drafter?._id || v.drafter) === String(user._id);
const officeOnly = (req, _res, next) => (isOffice(req.user) ? next() : requireOffice(req, _res, next));

const LIST_FIELDS = 'reportNo type version customer valuation applicantName reportTemplate templateTitle fairMarketValue propertyAddress generatedBy editedAt createdAt snapshot.referenceNo status approvedAt approvedBy returnNote returnedAt returnedBy';
// review = waiting for the superadmin (also older reports with nothing recorded) · returned = sent back · approved
const STATUS_FILTER = {
  review: { status: { $nin: ['approved', 'returned'] } },
  returned: { status: 'returned' },
  approved: { status: 'approved' },
};
const idOf = (x) => String(x?._id || x || '');

// Being drafted: sheets with a drafter (not generated yet, or sent back for a new version). Opening one continues
// in the drafting screen. Shown first in Reports so nothing waiting is missed.
const DRAFT_LIMIT = 100;
async function listDrafts(req) {
  const { q, customer, template, generatedBy, type, bank } = req.query;
  if (generatedBy || (type && type !== 'bank')) return []; // drafts have no author yet / are bank reports
  const filter = { status: { $in: ['submitted', 'received', 'returned'] } };
  if (isDrafter(req.user) && req.query.mine === '1') filter.drafter = req.user._id;
  if (customer && mongoose.isValidObjectId(customer)) filter.customer = customer;
  if (template) filter['summary.reportTemplate'] = String(template);
  if (bank) filter['summary.bankName'] = String(bank);
  const rx = searchRx(q);
  if (rx) {
    const digits = searchDigits(q);
    filter.$or = [{ 'summary.applicantName': rx }, { referenceNo: rx }, { 'summary.phone': rx }, ...(digits ? [{ 'summary.phone': new RegExp(digits) }] : [])];
  }
  const sheets = await Valuation.find(filter).sort({ updatedAt: -1 }).limit(DRAFT_LIMIT)
    .select('referenceNo status summary customer drafter reportEditedAt reportOverrides returnNote returnedAt draftReady draftMissing updatedAt')
    .populate('customer', 'code name phone1').populate('drafter', 'name').lean();
  if (!sheets.length) return [];
  const counts = await Report.aggregate([
    { $match: { valuation: { $in: sheets.map((s) => s._id) } } },
    { $group: { _id: '$valuation', count: { $sum: 1 } } },
  ]);
  const byId = new Map(counts.map((l) => [String(l._id), l.count]));
  return sheets.map((s) => ({
    _id: `draft-${s._id}`,
    kind: 'draft',
    status: 'draft',
    sheetStatus: s.status,
    valuation: s._id,
    customer: s.customer,
    applicantName: s.summary?.applicantName,
    reportTemplate: s.summary?.reportTemplate,
    fairMarketValue: s.summary?.fairMarketValue,
    snapshot: { referenceNo: s.referenceNo },
    drafter: s.drafter || null,
    editedAt: s.reportEditedAt || s.updatedAt,
    edits: Object.keys(s.reportOverrides || {}).length,
    returnNote: s.status === 'returned' ? s.returnNote : undefined,
    ready: !!s.draftReady,
    missing: s.draftMissing || 0,
    version: (byId.get(String(s._id)) || 0) + 1,
  }));
}

async function load(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid id');
  const r = await Report.findById(id).populate('customer', 'code name phone1').populate('generatedBy', 'name').populate('editedBy', 'name')
    .populate('approvedBy', 'name').populate('returnedBy', 'name');
  if (!r) throw new HttpError(404, 'Report not found');
  return r;
}

// the other versions of the same report, newest first (shown on the report page)
async function withVersions(r) {
  const versions = await Report.find({ valuation: r.valuation, type: r.type }).sort({ version: -1 })
    .select('reportNo version status createdAt approvedAt returnedAt returnNote generatedBy').populate('generatedBy', 'name').lean();
  return { ...r.toJSON(), versions };
}

// report number, e.g. DSK-RPT-0001 (atomic counter)
const nextReportNo = () => nextId('rpt');

router.get('/types', officeOnly, (_req, res) => res.json({ types: REPORT_TYPES }));

// search + filters shared by the list and the board
async function listFilter(req) {
  const { q, customer, valuation, type, template, generatedBy, bank } = req.query;
  const filter = { ...dateRange(req.query) };
  if (customer && mongoose.isValidObjectId(customer)) filter.customer = customer;
  if (valuation && mongoose.isValidObjectId(valuation)) filter.valuation = valuation;
  if (type && REPORT_TYPE_KEYS.includes(type)) filter.type = type;
  if (template) filter.reportTemplate = String(template);
  if (generatedBy === 'me') filter.generatedBy = req.user._id;
  else if (generatedBy && mongoose.isValidObjectId(generatedBy)) filter.generatedBy = generatedBy;
  if (bank) filter['snapshot.data.general.bankName'] = String(bank);
  const rx = searchRx(q);
  if (rx) {
    // also find reports through the customer's current name / phone
    const digits = searchDigits(q);
    const people = await Customer.find({ $or: [{ name: rx }, ...(digits ? [{ phone1: new RegExp(digits) }, { phone2: new RegExp(digits) }] : [])] }).distinct('_id');
    filter.$or = [{ reportNo: rx }, { applicantName: rx }, { 'snapshot.referenceNo': rx }, { propertyAddress: rx }, { templateTitle: rx }, { customer: { $in: people } }];
  }
  return filter;
}

async function reportFacets() {
  const [templates, authorIds, banks] = await Promise.all([Report.distinct('reportTemplate'), Report.distinct('generatedBy'), Report.distinct('snapshot.data.general.bankName')]);
  const authors = authorIds.length ? await User.find({ _id: { $in: authorIds } }).select('name').sort({ name: 1 }).lean() : [];
  return { templates: options(templates), generatedBy: authors, banks: options(banks) };
}

// Kanban board: Drafting · Awaiting approval · Sent back · Approved (latest first, up to 60 cards a column)
const BOARD_LIMIT = 60;
router.get(
  '/board',
  officeOnly,
  asyncHandler(async (req, res) => {
    const filter = await listFilter(req);
    const keys = Object.keys(STATUS_FILTER);
    const drafts = await listDrafts(req);
    const results = await Promise.all(keys.map((k) => {
      const f = { $and: [filter, STATUS_FILTER[k]] };
      return Promise.all([
        Report.find(f).sort({ createdAt: -1 }).limit(BOARD_LIMIT).select(LIST_FIELDS).populate('customer', 'code name phone1').populate('generatedBy', 'name').populate('approvedBy', 'name').lean(),
        Report.countDocuments(f),
      ]);
    }));
    res.json({
      columns: { draft: { items: drafts, total: drafts.length }, ...Object.fromEntries(keys.map((k, i) => [k, { items: results[i][0], total: results[i][1] }])) },
      limit: BOARD_LIMIT,
    });
  })
);

router.get(
  '/',
  officeOnly,
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    const { page: pg, limit: lim } = paging(req.query);
    if (status === 'draft') {
      const drafts = await listDrafts(req);
      return res.json({ items: drafts.slice((pg - 1) * lim, pg * lim), total: drafts.length, page: pg, pages: Math.max(1, Math.ceil(drafts.length / lim)), types: REPORT_TYPES, facets: await reportFacets() });
    }
    // All: being drafted first, then the stored reports
    const drafts = status ? [] : await listDrafts(req);
    const filter = await listFilter(req);
    if (STATUS_FILTER[status]) Object.assign(filter, { $and: [...(filter.$and || []), STATUS_FILTER[status]] });
    const sortSpec = sorting(req.query, { created: 'createdAt', value: 'fairMarketValue', customer: 'applicantName', reportNo: 'reportNo' });
    const { page, limit, skip } = paging(req.query);
    const start = skip; // position in the combined list (drafts, then reports)
    const draftPart = drafts.slice(start, start + limit);
    const reportSkip = Math.max(0, start - drafts.length);
    const reportLimit = limit - draftPart.length;
    const [reports, reportTotal, facets, counts] = await Promise.all([
      reportLimit > 0
        ? Report.find(filter).collation({ locale: 'en' }).sort(sortSpec).skip(reportSkip).limit(reportLimit).select(LIST_FIELDS)
          .populate('customer', 'code name phone1').populate('generatedBy', 'name').populate('approvedBy', 'name').lean()
        : [],
      Report.countDocuments(filter),
      reportFacets(),
      Promise.all(Object.values(STATUS_FILTER).map((f) => Report.countDocuments(f))),
    ]);
    const total = drafts.length + reportTotal;
    res.json({
      items: [...draftPart, ...reports], total, drafts: drafts.length, page, pages: Math.ceil(total / limit), types: REPORT_TYPES, facets,
      counts: Object.fromEntries(Object.keys(STATUS_FILTER).map((k, i) => [k, counts[i]])),
    });
  })
);

// Generate a report from a sheet being drafted and store a frozen copy: it goes to the superadmin for approval.
// The drafter who has the sheet (or the superadmin) generates it; the whole sheet must be complete.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { valuation: valuationId, type = 'bank' } = req.body || {};
    if (!REPORT_TYPE_KEYS.includes(type)) throw new HttpError(422, 'Choose a report type');
    if (!mongoose.isValidObjectId(valuationId)) throw new HttpError(422, 'Choose an input sheet');
    const v = await Valuation.findById(valuationId).populate('evaluator', 'name').populate('reviewedBy', 'name').populate('drafter', 'name');
    if (!v) throw new HttpError(404, 'Input sheet not found');
    if (!isOffice(req.user) && !draftsIt(req.user, v)) throw new HttpError(403, 'Forbidden');
    const reasons = {
      draft: 'The field evaluator has not submitted the site inspection yet.',
      rejected: 'This sheet was sent back to the field evaluator. A report can be generated once they resubmit it.',
      pending: 'A report from this sheet is already waiting for the superadmin’s approval.',
      approved: 'The report for this sheet has been approved and is final.',
    };
    // the superadmin's own site inspection: straight to the report (no submitting, no drafters' queue)
    const ownInspection = isSuperadmin(req.user) && idOf(v.evaluator) === String(req.user._id) && ['draft', 'rejected'].includes(v.status);
    if (reasons[v.status] && !ownInspection) throw new HttpError(409, reasons[v.status]);
    if (isDrafter(req.user) && v.drafter && idOf(v.drafter) !== String(req.user._id)) throw new HttpError(409, `${v.drafter.name || 'Another drafter'} is drafting this sheet.`);
    if (!v.results?.summary) throw new HttpError(409, 'This input sheet has no calculated results');
    const missing = validate(v.data || {}, { mode: 'submit' });
    if (missing.length) {
      const err = new HttpError(409, `Complete the sheet first: ${missing.length} field${missing.length === 1 ? '' : 's'} to fill (${missing.slice(0, 3).map((e) => e.message.replace(/ is required$/, '')).join(', ')}${missing.length > 3 ? '…' : ''}).`);
      err.details = missing;
      throw err;
    }

    const approveNow = isSuperadmin(req.user);
    const previous = await Report.countDocuments({ valuation: v._id, type });
    const tpl = v.summary?.reportTemplate;
    const doc = {
      type,
      version: previous + 1,
      customer: v.customer,
      valuation: v._id,
      snapshot: {
        referenceNo: v.referenceNo,
        status: 'approved', // the stored copy prints without the draft watermark
        data: v.data,
        results: v.results,
        evaluatorName: v.evaluator?.name,
        reviewedByName: v.reviewedBy?.name,
        reviewedAt: v.reviewedAt,
      },
      applicantName: v.summary?.applicantName,
      reportTemplate: tpl,
      templateTitle: REPORT_TEMPLATES[tpl]?.title || tpl,
      fairMarketValue: v.summary?.fairMarketValue,
      propertyAddress: propertyAddress(v.data?.property || {}),
      overrides: v.reportOverrides || {},
      generatedBy: req.user._id,
      // the superadmin is the approver: a report they generate is approved (final) straight away
      ...(approveNow ? { status: 'approved', approvedAt: new Date(), approvedBy: req.user._id } : { status: 'review' }),
    };
    // report numbers are unique; retry if two are generated at the same moment
    let report;
    for (let attempt = 0; attempt < 3 && !report; attempt += 1) {
      try {
        report = await Report.create({ ...doc, reportNo: await nextReportNo() });
      } catch (err) {
        if (err.code !== 11000) throw err;
      }
    }
    if (!report) throw new HttpError(409, 'Could not number the report, please try again');
    // an older version still waiting (from before this workflow) is replaced by this one
    await Report.updateMany({ valuation: v._id, type, _id: { $ne: report._id }, status: { $nin: ['approved', 'returned'] } }, { $set: { status: 'returned', returnNote: `Replaced by version ${report.version}` } });
    // the drafter who generated it keeps the sheet (the superadmin generating one doesn't take it over)
    await Valuation.updateOne(
      { _id: v._id },
      { $set: {
        status: approveNow ? 'approved' : 'pending', reportedAt: new Date(),
        ...(approveNow ? { approvedAt: new Date(), approvedBy: req.user._id } : {}),
        ...(ownInspection ? { submittedAt: v.submittedAt || new Date() } : {}),
        ...(v.drafter ? {} : isDrafter(req.user) || ownInspection ? { drafter: req.user._id, receivedAt: new Date(), receivedBy: req.user._id } : {}),
      } },
      { timestamps: false },
    );
    await logActivity(req, 'report.generated', {
      entityType: 'report', entityId: report._id,
      summary: `Generated ${report.reportNo} (v${report.version}) from ${v.referenceNo}${report.applicantName ? ` for ${report.applicantName}` : ''}${approveNow ? '' : ': sent for approval'}`,
      meta: { reportNo: report.reportNo, referenceNo: v.referenceNo, type, version: report.version, fairMarketValue: report.fairMarketValue },
    });
    if (approveNow) {
      await logActivity(req, 'report.approved', {
        entityType: 'report', entityId: report._id,
        summary: `Approved ${report.reportNo} (v${report.version})${report.applicantName ? ` for ${report.applicantName}` : ''} (generated by the superadmin)`,
        meta: { reportNo: report.reportNo, version: report.version },
      });
    }
    res.status(201).json(report);
  })
);

router.get('/:id', asyncHandler(async (req, res) => {
  const r = await load(req.params.id);
  if (!isOffice(req.user) && !draftsIt(req.user, await Valuation.findById(r.valuation).select('drafter').lean())) throw new HttpError(404, 'Report not found');
  res.json(await withVersions(r));
}));

// The superadmin's decision: approved (final: the report and the sheet are locked) or returned (back to the drafter
// with a note; the next report is a new version)
router.patch(
  '/:id/status',
  requireSuperadmin,
  asyncHandler(async (req, res) => {
    const { status, note } = req.body || {};
    if (!['approved', 'returned'].includes(status)) throw new HttpError(400, 'Approve the report or send it back to the drafter');
    const r = await load(req.params.id);
    if (isApprovedReport(r)) throw new HttpError(409, 'This report is approved and final.');
    if (r.status === 'returned') throw new HttpError(409, 'This version was sent back; a newer version replaces it.');
    const v = await Valuation.findById(r.valuation).populate('drafter', 'name');
    const at = new Date();
    if (status === 'approved') {
      Object.assign(r, { status, approvedAt: at, approvedBy: req.user._id });
      await r.save();
      if (v) await Valuation.updateOne({ _id: v._id }, { $set: { status: 'approved', approvedAt: at, approvedBy: req.user._id }, $unset: { returnNote: 1 } }, { timestamps: false });
    } else {
      const text = String(note || '').trim();
      if (!text) throw new HttpError(422, 'Say what the drafter should change');
      Object.assign(r, { status, returnNote: text.slice(0, 2000), returnedAt: at, returnedBy: req.user._id });
      await r.save();
      if (v) await Valuation.updateOne({ _id: v._id }, { $set: { status: 'returned', returnNote: r.returnNote, returnedAt: at, returnedBy: req.user._id } }, { timestamps: false });
    }
    await logActivity(req, status === 'approved' ? 'report.approved' : 'report.returned', {
      entityType: 'report', entityId: r._id,
      summary: status === 'approved'
        ? `Approved ${r.reportNo} (v${r.version})${r.applicantName ? ` for ${r.applicantName}` : ''}`
        : `Sent ${r.reportNo} (v${r.version}) back to ${v?.drafter?.name || 'the drafter'}: ${r.returnNote.slice(0, 80)}`,
      meta: { reportNo: r.reportNo, version: r.version, note: r.returnNote },
    });
    res.json(await withVersions(await load(r._id)));
  })
);

// Superadmin: wording edits on a report waiting for approval (the frozen values themselves never change)
router.put(
  '/:id/overrides',
  requireSuperadmin,
  asyncHandler(async (req, res) => {
    const r = await load(req.params.id);
    if (isApprovedReport(r)) throw new HttpError(409, 'This report is approved, so its wording is locked.');
    if (r.status === 'returned') throw new HttpError(409, 'This version was sent back to the drafter; edit the next version instead.');
    const input = req.body?.overrides;
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'overrides must be an object');
    const entries = Object.entries(input);
    if (entries.length > 1000) throw new HttpError(400, 'Too many edited fields');
    const clean = {};
    for (const [k, val] of entries) {
      if (!/^[A-Za-z0-9_.-]{1,80}$/.test(k) || typeof val !== 'string') throw new HttpError(400, `Invalid field "${String(k).slice(0, 40)}"`);
      clean[k] = val.slice(0, 5000);
    }
    Object.assign(r, { overrides: clean, editedBy: req.user._id, editedAt: new Date() });
    r.markModified('overrides');
    await r.save();
    await logActivity(req, 'report.edited', { entityType: 'report', entityId: r._id, summary: `Edited wording on ${r.reportNo}` });
    res.json({ overrides: r.overrides, editedAt: r.editedAt, editedBy: { name: req.user.name } });
  })
);

router.delete(
  '/:id',
  requireSuperadmin,
  asyncHandler(async (req, res) => {
    const r = await load(req.params.id);
    await r.deleteOne();
    // no report waiting or approved any more: the sheet goes back to its drafter
    if (r.valuation && !(await Report.exists({ valuation: r.valuation, status: { $ne: 'returned' } }))) {
      await Valuation.updateOne({ _id: r.valuation, status: { $in: ['pending', 'approved'] } }, { $set: { status: 'received' }, $unset: { approvedAt: 1, approvedBy: 1 } }, { timestamps: false });
    }
    await logActivity(req, 'report.deleted', { entityType: 'report', entityId: r._id, summary: `Deleted ${r.reportNo}` });
    res.status(204).end();
  })
);

export default router;
