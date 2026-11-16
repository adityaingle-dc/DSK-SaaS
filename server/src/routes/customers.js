import { Router } from 'express';
import mongoose from 'mongoose';
import { emptyValuation, propertyKey, sanitize } from '@dsk/shared';
import Customer, { CUSTOMER_SOURCES, customerKey } from '../models/Customer.js';
import Valuation from '../models/Valuation.js';
import Report from '../models/Report.js';
import User from '../models/User.js';
import { protect, requireSuperadmin } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { logActivity, valuationMeta } from '../services/activity.js';
import { importCustomersFromValuations, sheetPrefillFromCustomer } from '../services/customers.js';

// Customers – the entry point of a valuation job. Superadmin only.
const router = Router();
router.use(protect, requireSuperadmin);

const EDITABLE = ['salutation', 'name', 'relation', 'relativeName', 'occupation', 'phone1', 'phone2', 'email', 'houseNo', 'street', 'locality', 'district', 'pincode', 'bankName', 'branch', 'source', 'notes'];
// phones are stored as plain 10-digit mobile numbers (the input sheet's format), e.g. "+91 98765-43210" -> "9876543210"
const normalisePhone = (p) => {
  const digits = String(p || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
};
const pick = (body) =>
  Object.fromEntries(
    Object.entries(body || {})
      .filter(([k, v]) => EDITABLE.includes(k) && v !== undefined)
      .map(([k, v]) => [k, ['phone1', 'phone2'].includes(k) ? normalisePhone(v) : typeof v === 'string' ? v.trim() : v])
  );
import { dateRange, options, paging, searchDigits, searchRx, sorting } from '../utils/listQuery.js';

const OPEN_STATUSES = ['draft', 'submitted', 'rejected'];

function check(fields, { partial = false } = {}) {
  if (!partial || 'name' in fields) {
    if (!fields.name) throw new HttpError(422, 'Customer name is required');
  }
  if (!partial || 'phone1' in fields) {
    if (!/^[6-9][0-9]{9}$/.test(fields.phone1 || '')) throw new HttpError(422, 'Enter a valid 10-digit mobile number');
  }
  if (fields.phone2 && !/^[6-9][0-9]{9}$/.test(fields.phone2)) {
    throw new HttpError(422, 'Alternate phone must be a 10-digit mobile number');
  }
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) throw new HttpError(422, 'Enter a valid email address');
  if (fields.source && !CUSTOMER_SOURCES.includes(fields.source)) throw new HttpError(422, 'Unknown source');
}

async function load(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid id');
  const c = await Customer.findById(id).populate('createdBy', 'name');
  if (!c) throw new HttpError(404, 'Customer not found');
  return c;
}

// per-customer totals for a page of customers
async function statsFor(ids) {
  const rows = await Valuation.aggregate([
    { $match: { customer: { $in: ids } } },
    { $sort: { updatedAt: -1 } },
    {
      $group: {
        _id: '$customer',
        total: { $sum: 1 },
        approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
        open: { $sum: { $cond: [{ $in: ['$status', ['draft', 'submitted', 'rejected']] }, 1, 0] } },
        totalValue: { $sum: { $ifNull: ['$summary.fairMarketValue', 0] } },
        latestStatus: { $first: '$status' },
        lastAt: { $first: '$updatedAt' },
      },
    },
  ]);
  const props = {};
  const sheets = await Valuation.find({ customer: { $in: ids } }).select('customer data.property').lean();
  for (const v of sheets) {
    const id = String(v.customer);
    props[id] ||= new Set();
    props[id].add(propertyKey(v.data?.property) || `sheet:${v._id}`);
  }
  return Object.fromEntries(rows.map((r) => [String(r._id), { ...r, properties: props[String(r._id)]?.size || 0 }]));
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { q, stage, source, bank, district } = req.query;
    const filter = { ...dateRange(req.query) };
    const rx = searchRx(q);
    if (rx) {
      filter.$or = [{ name: rx }, { email: rx }, { district: rx }, { bankName: rx }, { branch: rx }, { locality: rx }, { street: rx }, { pincode: rx }];
      const digits = searchDigits(q);
      if (digits) filter.$or.push({ phone1: new RegExp(digits) }, { phone2: new RegExp(digits) });
    }
    if (source && CUSTOMER_SOURCES.includes(source)) filter.source = source;
    if (bank) filter.bankName = String(bank);
    if (district) filter.district = String(district);

    // stage comes from the customer's valuations: new enquiry (none yet) · in progress (an open sheet) · completed
    const [withSheets, withOpen] = await Promise.all([
      Valuation.distinct('customer', { customer: { $ne: null } }),
      Valuation.distinct('customer', { customer: { $ne: null }, status: { $in: OPEN_STATUSES } }),
    ]);
    const openSet = new Set(withOpen.map(String));
    const doneIds = withSheets.filter((id) => !openSet.has(String(id)));
    const STAGES = { new: { _id: { $nin: withSheets } }, open: { _id: { $in: withOpen } }, done: { _id: { $in: doneIds } } };
    const scoped = STAGES[stage] ? { $and: [filter, STAGES[stage]] } : filter;

    const sortSpec = sorting(req.query, { updated: 'updatedAt', name: 'name', created: 'createdAt' });
    const { page: pageNum, limit: lim, skip } = paging(req.query);
    const [items, total, all, stageNew, stageOpen, stageDone, banks, districts] = await Promise.all([
      Customer.find(scoped).collation({ locale: 'en' }).sort(sortSpec).skip(skip).limit(lim),
      Customer.countDocuments(scoped),
      Customer.estimatedDocumentCount(),
      Customer.countDocuments({ $and: [filter, STAGES.new] }),
      Customer.countDocuments({ $and: [filter, STAGES.open] }),
      Customer.countDocuments({ $and: [filter, STAGES.done] }),
      Customer.distinct('bankName'),
      Customer.distinct('district'),
    ]);
    const stats = await statsFor(items.map((c) => c._id));
    const unlinked = all === 0 ? await Valuation.countDocuments({ $or: [{ customer: null }, { customer: { $exists: false } }] }) : 0;
    res.json({
      items: items.map((c) => ({ ...c.toJSON(), stats: stats[String(c._id)] || { total: 0, approved: 0, open: 0, totalValue: 0, properties: 0 } })),
      total,
      page: pageNum,
      pages: Math.ceil(total / lim),
      sources: CUSTOMER_SOURCES,
      // counts per stage for the current search / filters (tab badges)
      stages: { all: stageNew + stageOpen + stageDone, new: stageNew, open: stageOpen, done: stageDone },
      facets: { banks: options(banks), districts: options(districts) },
      unlinkedValuations: unlinked, // > 0 on a fresh install: offer the one-time import
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const fields = pick(req.body);
    check(fields);
    const dupe = await Customer.findOne({ matchKey: customerKey(fields) });
    if (dupe) {
      const err = new HttpError(409, `${dupe.name} is already a customer with this phone number`);
      err.details = [{ field: 'phone1', message: 'Phone number already registered', customerId: String(dupe._id) }];
      throw err;
    }
    const c = await Customer.create({ ...fields, createdBy: req.user._id });
    await logActivity(req, 'customer.created', { entityType: 'customer', entityId: c._id, summary: `Added customer ${c.name}` });
    res.status(201).json(c);
  })
);

// one-time import of customers from existing valuations (safe to repeat)
router.post(
  '/import',
  asyncHandler(async (req, res) => {
    const result = await importCustomersFromValuations(req.user);
    await logActivity(req, 'customer.imported', { entityType: 'customer', summary: `Imported ${result.created} customers from ${result.linked} valuations` });
    res.json(result);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const c = await load(req.params.id);
    const valuations = await Valuation.find({ customer: c._id })
      .sort({ createdAt: -1 })
      .select('referenceNo status data results.summary results.context summary evaluator createdAt updatedAt submittedAt reviewedAt reviewNote reportEditedAt')
      .populate('evaluator', 'name')
      .lean();
    const reports = await Report.find({ customer: c._id })
      .sort({ createdAt: -1 })
      .select('reportNo type version valuation applicantName reportTemplate templateTitle fairMarketValue propertyAddress createdAt snapshot.referenceNo generatedBy')
      .populate('generatedBy', 'name')
      .lean();
    res.json({ customer: c, valuations, reports });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const c = await load(req.params.id);
    const fields = pick(req.body);
    check(fields, { partial: true });
    const nextKey = customerKey({ ...c.toObject(), ...fields });
    if (nextKey !== c.matchKey) {
      const dupe = await Customer.findOne({ matchKey: nextKey, _id: { $ne: c._id } });
      if (dupe) throw new HttpError(409, `${dupe.name} is already a customer with this phone number`);
    }
    Object.assign(c, fields);
    await c.save();
    await logActivity(req, 'customer.updated', { entityType: 'customer', entityId: c._id, summary: `Updated customer ${c.name}` });
    res.json(c);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const c = await load(req.params.id);
    const count = await Valuation.countDocuments({ customer: c._id });
    if (count) throw new HttpError(409, 'This customer has valuations and cannot be deleted');
    await c.deleteOne();
    await logActivity(req, 'customer.deleted', { entityType: 'customer', entityId: c._id, summary: `Deleted customer ${c.name}` });
    res.status(204).end();
  })
);

// Start a valuation for this customer: a draft input sheet, prefilled from the profile, assigned to an evaluator.
// `fromValuation` (optional) = re-value a property already on file: its location, boundaries and property type
// are copied from that earlier sheet so the evaluator doesn't type them again.
const PROPERTY_SECTIONS = ['property', 'boundaries'];
router.post(
  '/:id/valuations',
  asyncHandler(async (req, res) => {
    const c = await load(req.params.id);
    const { evaluator, fromValuation, site } = req.body || {};
    // `site` (new property): the address the evaluator will visit, copied into the sheet's "Property location"
    const SITE_FIELDS = ['description', 'numberType', 'number', 'surveyNo', 'street', 'village', 'localBodyType', 'localBodyName', 'district', 'pincode', 'landmark', 'location'];
    const siteFields = site && typeof site === 'object'
      ? Object.fromEntries(Object.entries(site).filter(([k, val]) => SITE_FIELDS.includes(k) && val !== '' && val != null))
      : null;
    if (!fromValuation && siteFields && !(siteFields.street || siteFields.village) ) throw new HttpError(422, 'Enter the site street or village so the evaluator can find it');
    if (!mongoose.isValidObjectId(evaluator)) throw new HttpError(422, 'Choose who will do the valuation');
    const assignee = await User.findById(evaluator);
    if (!assignee || assignee.status !== 'active') throw new HttpError(422, 'That team member is not active');

    let previous = null;
    if (fromValuation) {
      if (!mongoose.isValidObjectId(fromValuation)) throw new HttpError(400, 'Invalid property');
      previous = await Valuation.findOne({ _id: fromValuation, customer: c._id }).select('data referenceNo').lean();
      if (!previous) throw new HttpError(404, "That property isn't on this customer's record");
    }

    const data = emptyValuation();
    const prefill = sheetPrefillFromCustomer(c);
    data.applicant = { ...(data.applicant || {}), ...prefill.applicant };
    data.general = { ...(data.general || {}), ...prefill.general };
    if (!previous && siteFields) data.property = { ...(data.property || {}), ...siteFields };
    if (previous) {
      for (const key of PROPERTY_SECTIONS) if (previous.data?.[key]) data[key] = previous.data[key];
      if (previous.data?.general?.propertyType) data.general.propertyType = previous.data.general.propertyType;
    }
    const v = new Valuation({ data: sanitize(data), evaluator: assignee._id, customer: c._id, assignedBy: req.user._id, assignedAt: new Date() });
    v.recompute();
    await v.save();
    await logActivity(req, 'valuation.assigned', {
      entityType: 'valuation',
      entityId: v._id,
      summary: previous
        ? `Started re-valuation ${v.referenceNo} for ${c.name} (property from ${previous.referenceNo}) and assigned it to ${assignee.name}`
        : `Started ${v.referenceNo} for ${c.name} and assigned it to ${assignee.name}`,
      meta: { ...valuationMeta(v), assignee: assignee.name, customer: c.name, revaluationOf: previous?.referenceNo },
    });
    res.status(201).json({ _id: v._id, referenceNo: v.referenceNo, evaluator: { _id: assignee._id, name: assignee.name } });
  })
);

export default router;
