import { Router } from 'express';
import mongoose from 'mongoose';
import { propertyAddress, REPORT_TEMPLATES } from '@dsk/shared';
import Report, { REPORT_TYPES, REPORT_TYPE_KEYS } from '../models/Report.js';
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
const LIST_FIELDS = 'reportNo type version customer valuation applicantName reportTemplate templateTitle fairMarketValue propertyAddress generatedBy editedAt createdAt snapshot.referenceNo';

async function load(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid id');
  const r = await Report.findById(id).populate('customer', 'code name phone1').populate('generatedBy', 'name').populate('editedBy', 'name');
  if (!r) throw new HttpError(404, 'Report not found');
  return r;
}

// next number for this year: RPT/2026/0001
// report number, e.g. DSK-RPT-0001 (atomic counter)
const nextReportNo = () => nextId('rpt');

router.get('/types', (_req, res) => res.json({ types: REPORT_TYPES }));

router.get(
  '/',
  asyncHandler(async (req, res) => {
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
    const sortSpec = sorting(req.query, { created: 'createdAt', value: 'fairMarketValue', customer: 'applicantName', reportNo: 'reportNo' });
    const { page, limit, skip } = paging(req.query);
    const [items, total, templates, authorIds] = await Promise.all([
      Report.find(filter).collation({ locale: 'en' }).sort(sortSpec).skip(skip).limit(limit).select(LIST_FIELDS)
        .populate('customer', 'code name phone1').populate('generatedBy', 'name').lean(),
      Report.countDocuments(filter),
      Report.distinct('reportTemplate'),
      Report.distinct('generatedBy'),
    ]);
    const authors = authorIds.length ? await User.find({ _id: { $in: authorIds } }).select('name').sort({ name: 1 }).lean() : [];
    res.json({ items, total, page, pages: Math.ceil(total / limit), types: REPORT_TYPES, facets: { templates: options(templates), generatedBy: authors } });
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

// wording edits on the stored report (the frozen values themselves never change)
router.put(
  '/:id/overrides',
  asyncHandler(async (req, res) => {
    const r = await load(req.params.id);
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
