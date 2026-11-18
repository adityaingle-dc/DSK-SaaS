import { Router } from 'express';
import mongoose from 'mongoose';
import { propertyAddress, REPORT_TEMPLATES } from '@dsk/shared';
import Report, { REPORT_TYPES, REPORT_TYPE_KEYS, isApprovedReport } from '../models/Report.js';
import Valuation from '../models/Valuation.js';
import Customer from '../models/Customer.js';
import User from '../models/User.js';
import { dateRange, options, paging, searchDigits, searchRx, sorting } from '../utils/listQuery.js';
import { protect, requireSuperadmin } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { logActivity } from '../services/activity.js';
import { nextId } from '../services/ids.js';

// Reports module: select customer → select an approved input sheet → select report type → generate & store.
const router = Router();
router.use(protect, requireSuperadmin);

const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LIST_FIELDS = 'reportNo type version customer valuation applicantName reportTemplate templateTitle fairMarketValue propertyAddress generatedBy editedAt createdAt snapshot.referenceNo status approvedAt approvedBy';
// the bank's decision on generated reports; nothing recorded yet = in review with the bank
const STATUS_FILTER = { review: { status: { $ne: 'approved' } }, approved: { status: 'approved' } };

// Drafts: approved input sheets whose report wording was edited and saved (Generate → step 4), but no report has
// been generated since that save. They are not stored reports yet; opening one continues in the Generate flow.
const DRAFT_LIMIT = 100;
async function listDrafts(req) {
  const { q, customer, template, generatedBy, type } = req.query;
  if (generatedBy || (type && type !== 'bank')) return []; // drafts have no author / are bank reports
  const filter = { status: 'approved', reportEditedAt: { $ne: null } };
  if (customer && mongoose.isValidObjectId(customer)) filter.customer = customer;
  if (template) filter['summary.reportTemplate'] = String(template);
  const rx = searchRx(q);
  if (rx) {
    const digits = searchDigits(q);
    filter.$or = [{ 'summary.applicantName': rx }, { referenceNo: rx }, { 'summary.phone': rx }, ...(digits ? [{ 'summary.phone': new RegExp(digits) }] : [])];
  }
  const sheets = await Valuation.find(filter).sort({ reportEditedAt: -1 }).limit(DRAFT_LIMIT * 2)
    .select('referenceNo summary customer reportEditedAt reportEditedBy reportOverrides')
    .populate('customer', 'code name phone1').populate('reportEditedBy', 'name').lean();
  if (!sheets.length) return [];
  const latest = await Report.aggregate([
    { $match: { valuation: { $in: sheets.map((s) => s._id) } } },
    { $group: { _id: '$valuation', at: { $max: '$createdAt' }, count: { $sum: 1 } } },
  ]);
  const byId = new Map(latest.map((l) => [String(l._id), l]));
  return sheets
    .filter((s) => { const l = byId.get(String(s._id)); return !l || new Date(l.at) < new Date(s.reportEditedAt); })
    .slice(0, DRAFT_LIMIT)
    .map((s) => ({
      _id: `draft-${s._id}`,
      kind: 'draft',
      status: 'draft',
      valuation: s._id,
      customer: s.customer,
      applicantName: s.summary?.applicantName,
      reportTemplate: s.summary?.reportTemplate,
      fairMarketValue: s.summary?.fairMarketValue,
      snapshot: { referenceNo: s.referenceNo },
      editedAt: s.reportEditedAt,
      editedBy: s.reportEditedBy,
      edits: Object.keys(s.reportOverrides || {}).length,
      version: (byId.get(String(s._id))?.count || 0) + 1,
    }));
}

async function load(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid id');
  const r = await Report.findById(id).populate('customer', 'code name phone1').populate('generatedBy', 'name').populate('editedBy', 'name').populate('approvedBy', 'name');
  if (!r) throw new HttpError(404, 'Report not found');
  return r;
}

// next number for this year: RPT/2026/0001
// report number, e.g. DSK-RPT-0001 (atomic counter)
const nextReportNo = () => nextId('rpt');

router.get('/types', (_req, res) => res.json({ types: REPORT_TYPES }));

// search + filters shared by the list and the board
async function listFilter(req) {
    const { q, customer, valuation, type, template, generatedBy } = req.query;
    const filter = { ...dateRange(req.query) };
    if (customer && mongoose.isValidObjectId(customer)) filter.customer = customer;
    if (valuation && mongoose.isValidObjectId(valuation)) filter.valuation = valuation;
    if (type && REPORT_TYPE_KEYS.includes(type)) filter.type = type;
    if (template) filter.reportTemplate = String(template);
    if (generatedBy && mongoose.isValidObjectId(generatedBy)) filter.generatedBy = generatedBy;
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
  const [templates, authorIds] = await Promise.all([Report.distinct('reportTemplate'), Report.distinct('generatedBy')]);
  const authors = authorIds.length ? await User.find({ _id: { $in: authorIds } }).select('name').sort({ name: 1 }).lean() : [];
  return { templates: options(templates), generatedBy: authors };
}

// Kanban board: Draft · In review · Approved (latest first, up to 60 cards a column)
const BOARD_LIMIT = 60;
router.get(
  '/board',
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
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    const { page: pg, limit: lim } = paging(req.query);
    if (status === 'draft') {
      const drafts = await listDrafts(req);
      return res.json({ items: drafts.slice((pg - 1) * lim, pg * lim), total: drafts.length, page: pg, pages: Math.max(1, Math.ceil(drafts.length / lim)), types: REPORT_TYPES, facets: await reportFacets() });
    }
    // All: drafts (not generated yet) first, then the stored reports
    const drafts = status ? [] : await listDrafts(req);
    const filter = await listFilter(req);
    if (STATUS_FILTER[status]) Object.assign(filter, { $and: [...(filter.$and || []), STATUS_FILTER[status]] });
    const sortSpec = sorting(req.query, { created: 'createdAt', value: 'fairMarketValue', customer: 'applicantName', reportNo: 'reportNo' });
    const { page, limit, skip } = paging(req.query);
    const start = skip; // position in the combined list (drafts, then reports)
    const draftPart = drafts.slice(start, start + limit);
    const reportSkip = Math.max(0, start - drafts.length);
    const reportLimit = limit - draftPart.length;
    const [reports, reportTotal, facets] = await Promise.all([
      reportLimit > 0
        ? Report.find(filter).collation({ locale: 'en' }).sort(sortSpec).skip(reportSkip).limit(reportLimit).select(LIST_FIELDS)
          .populate('customer', 'code name phone1').populate('generatedBy', 'name').populate('approvedBy', 'name').lean()
        : [],
      Report.countDocuments(filter),
      reportFacets(),
    ]);
    const total = drafts.length + reportTotal;
    res.json({ items: [...draftPart, ...reports], total, drafts: drafts.length, page, pages: Math.ceil(total / limit), types: REPORT_TYPES, facets });
  })
);

// generate a report from an approved input sheet and store a frozen copy
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { valuation: valuationId, type } = req.body || {};
    if (!REPORT_TYPE_KEYS.includes(type)) throw new HttpError(422, 'Choose a report type');
    if (!mongoose.isValidObjectId(valuationId)) throw new HttpError(422, 'Choose an input sheet');
    const v = await Valuation.findById(valuationId).populate('evaluator', 'name').populate('reviewedBy', 'name');
    if (!v) throw new HttpError(404, 'Input sheet not found');
    if (v.status !== 'approved') throw new HttpError(409, 'Only approved input sheets can be turned into a report');
    if (!v.results?.summary) throw new HttpError(409, 'This input sheet has no calculated results');

    const previous = await Report.countDocuments({ valuation: v._id, type });
    const tpl = v.summary?.reportTemplate;
    const doc = {
      type,
      version: previous + 1,
      customer: v.customer,
      valuation: v._id,
      snapshot: {
        referenceNo: v.referenceNo,
        status: v.status,
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
      status: 'review',
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
    await logActivity(req, 'report.generated', {
      entityType: 'report', entityId: report._id,
      summary: `Generated ${report.reportNo} (v${report.version}) from ${v.referenceNo}${report.applicantName ? ` for ${report.applicantName}` : ''}`,
      meta: { reportNo: report.reportNo, referenceNo: v.referenceNo, type, version: report.version, fairMarketValue: report.fairMarketValue },
    });
    res.status(201).json(report);
  })
);

router.get('/:id', asyncHandler(async (req, res) => res.json(await load(req.params.id))));

// In review ⇄ Approved
router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    if (!['review', 'approved'].includes(status)) throw new HttpError(400, 'status must be review or approved');
    const r = await load(req.params.id);
    const was = isApprovedReport(r) ? 'approved' : 'review';
    if (was === status) return res.json(r);
    if (status === 'approved') Object.assign(r, { status, approvedAt: new Date(), approvedBy: req.user._id });
    else Object.assign(r, { status, approvedAt: undefined, approvedBy: undefined });
    await r.save();
    await logActivity(req, status === 'approved' ? 'report.approved' : 'report.reopened', {
      entityType: 'report', entityId: r._id,
      summary: status === 'approved'
        ? `Recorded bank approval of ${r.reportNo}${r.applicantName ? ` for ${r.applicantName}` : ''}`
        : `Moved ${r.reportNo} back to "in review" with the bank`,
      meta: { reportNo: r.reportNo },
    });
    res.json(await load(r._id));
  })
);

// wording edits on the stored report (the frozen values themselves never change)
router.put(
  '/:id/overrides',
  asyncHandler(async (req, res) => {
    const r = await load(req.params.id);
    if (isApprovedReport(r)) throw new HttpError(409, 'The bank has approved this report, so its wording is locked. Move it back to in review to change it.');
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
  asyncHandler(async (req, res) => {
    const r = await load(req.params.id);
    await r.deleteOne();
    await logActivity(req, 'report.deleted', { entityType: 'report', entityId: r._id, summary: `Deleted ${r.reportNo}` });
    res.status(204).end();
  })
);

export default router;
