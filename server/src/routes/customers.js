import { Router } from 'express';
import mongoose from 'mongoose';
import { emptyValuation, propertyKey, sanitize } from '@dsk/shared';
import Customer, { CONTACT_TYPES, CUSTOMER_SOURCES, POC_ROLES, SERVICE_REQUESTS, customerKey } from '../models/Customer.js';
import Valuation from '../models/Valuation.js';
import Report from '../models/Report.js';
import User, { isSuperadmin } from '../models/User.js';
import { protect, requireSuperadmin } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { logActivity, valuationMeta } from '../services/activity.js';
import { importCustomersFromValuations, sheetPrefillFromCustomer } from '../services/customers.js';

// Customers – the entry point of a valuation job.
// Superadmin: every customer. Field evaluators: add customers, and see / edit / start input sheets only for
// the customers they added themselves (those sheets are always assigned to them).
const router = Router();
router.use(protect);
const fullAccess = (req) => isSuperadmin(req.user);
const ownScope = (req) => (fullAccess(req) ? {} : { createdBy: req.user._id });
// evaluators must not learn about customers they didn't add: same reply as "not found"
const dupeError = (req, dupe, msg) => {
  if (!fullAccess(req) && String(dupe.createdBy) !== String(req.user._id)) {
    return new HttpError(409, 'This customer is already registered with the office. Ask the superadmin to assign their input sheet to you.');
  }
  const err = new HttpError(409, msg);
  err.details = [{ field: 'phone1', message: 'Phone number already registered', customerId: String(dupe._id) }];
  return err;
};

const EDITABLE = ['contactType', 'pocName', 'pocPhone', 'pocRole', 'salutation', 'name', 'relation', 'relativeName', 'occupation', 'phone1', 'phone2', 'email', 'houseNo', 'street', 'locality', 'district', 'pincode', 'bankName', 'branch', 'source', 'serviceRequest', 'notes'];
// phones are stored as plain 10-digit mobile numbers (the input sheet's format), e.g. "+91 98765-43210" -> "9876543210"
const normalisePhone = (p) => {
  const digits = String(p || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
};
// customers brought by a contact person always "came via" that person
const withSource = (f) => (f.contactType === 'poc' ? { ...f, source: 'Contact person' } : f);
const pick = (body) =>
  Object.fromEntries(
    Object.entries(body || {})
      .filter(([k, v]) => EDITABLE.includes(k) && v !== undefined)
      .map(([k, v]) => [k, ['phone1', 'phone2', 'pocPhone'].includes(k) ? normalisePhone(v) : typeof v === 'string' ? v.trim() : v])
  );
import { dateRange, options, paging, searchDigits, searchRx, sorting } from '../utils/listQuery.js';

const OPEN_STATUSES = ['draft', 'submitted', 'rejected'];

// always checked on the full record (create: the new fields; update: saved record + changes)
const MOBILE = /^[6-9][0-9]{9}$/;
function check(fields, { creating = false } = {}) {
  const type = fields.contactType || 'individual';
  if (!CONTACT_TYPES.includes(type)) throw new HttpError(422, 'Unknown customer type');
  if (!fields.name) throw new HttpError(422, 'Customer name is required');
  if (type === 'poc') {
    if (!fields.pocName) throw new HttpError(422, "Contact person's name is required");
    if (!MOBILE.test(fields.pocPhone || '')) throw new HttpError(422, "Enter the contact person's 10-digit mobile number");
    if (fields.pocRole && !POC_ROLES.includes(fields.pocRole)) throw new HttpError(422, 'Unknown contact person role');
    if (fields.phone1 && !MOBILE.test(fields.phone1)) throw new HttpError(422, "Customer's phone must be a 10-digit mobile number");
  } else {
    if (!MOBILE.test(fields.phone1 || '')) throw new HttpError(422, 'Enter a valid 10-digit mobile number');
    if (creating && !fields.serviceRequest) throw new HttpError(422, 'Choose the service needed');
  }
  if (fields.serviceRequest && !SERVICE_REQUESTS.includes(fields.serviceRequest)) throw new HttpError(422, 'Unknown service');
  if (fields.phone2 && !/^[6-9][0-9]{9}$/.test(fields.phone2)) {
    throw new HttpError(422, 'Alternate phone must be a 10-digit mobile number');
  }
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) throw new HttpError(422, 'Enter a valid email address');
  if (fields.source && !CUSTOMER_SOURCES.includes(fields.source)) throw new HttpError(422, 'Unknown source');
}

async function load(id, req) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid id');
  const c = await Customer.findOne({ _id: id, ...(req ? ownScope(req) : {}) }).populate('createdBy', 'name');
  if (!c) throw new HttpError(404, 'Customer not found');
  return c;
}

// per-customer totals for a page of customers
// sheetScope: for an evaluator, only the sheets assigned to them count
async function statsFor(ids, sheetScope = {}) {
  const rows = await Valuation.aggregate([
    { $match: { customer: { $in: ids }, ...sheetScope } },
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
    const filter = { ...dateRange(req.query), ...ownScope(req) };
    const sheetScope = fullAccess(req) ? {} : { evaluator: req.user._id };
    const rx = searchRx(q);
    if (rx) {
      filter.$or = [{ code: rx }, { name: rx }, { pocName: rx }, { email: rx }, { district: rx }, { bankName: rx }, { branch: rx }, { locality: rx }, { street: rx }, { pincode: rx }];
      const digits = searchDigits(q);
      if (digits) filter.$or.push({ phone1: new RegExp(digits) }, { phone2: new RegExp(digits) }, { pocPhone: new RegExp(digits) });
    }
    if (source && CUSTOMER_SOURCES.includes(source)) filter.source = source;
    if (bank) filter.bankName = String(bank);
    if (district) filter.district = String(district);

    // stage comes from the customer's valuations: new enquiry (none yet) · in progress (an open sheet) · completed
    const [withSheets, withOpen] = await Promise.all([
      Valuation.distinct('customer', { customer: { $ne: null }, ...sheetScope }),
      Valuation.distinct('customer', { customer: { $ne: null }, status: { $in: OPEN_STATUSES }, ...sheetScope }),
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
      fullAccess(req) ? Customer.estimatedDocumentCount() : Customer.countDocuments(ownScope(req)),
      Customer.countDocuments({ $and: [filter, STAGES.new] }),
      Customer.countDocuments({ $and: [filter, STAGES.open] }),
      Customer.countDocuments({ $and: [filter, STAGES.done] }),
      Customer.distinct('bankName', ownScope(req)),
      Customer.distinct('district', ownScope(req)),
    ]);
    const stats = await statsFor(items.map((c) => c._id), sheetScope);
    const unlinked = all === 0 && fullAccess(req) ? await Valuation.countDocuments({ $or: [{ customer: null }, { customer: { $exists: false } }] }) : 0;
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
    const fields = withSource(pick(req.body));
    check(fields, { creating: true });
    const dupe = await Customer.findOne({ matchKey: customerKey(fields) });
    if (dupe) throw dupeError(req, dupe, fields.phone1 ? `${dupe.name} is already a customer with this phone number` : `${dupe.name} is already a customer (same name and contact person)`);
    const c = await Customer.create({ ...fields, createdBy: req.user._id });
    await logActivity(req, 'customer.created', { entityType: 'customer', entityId: c._id, summary: `Added customer ${c.name}` });
    res.status(201).json(c);
  })
);

// contact persons (POCs) already used on customers, one per phone number, most used first
router.get(
  '/pocs',
  asyncHandler(async (req, res) => {
    const match = { contactType: 'poc', pocPhone: { $nin: [null, ''] }, ...ownScope(req) };
    const q = String(req.query.q || '').trim();
    if (q) {
      const or = [{ pocName: searchRx(q) }];
      const digits = searchDigits(q);
      if (digits) or.push({ pocPhone: new RegExp(digits) });
      match.$or = or;
    }
    const items = await Customer.aggregate([
      { $match: match },
      { $sort: { updatedAt: -1 } },
      { $group: { _id: '$pocPhone', pocName: { $first: '$pocName' }, pocRole: { $first: '$pocRole' }, customers: { $sum: 1 }, lastUsed: { $first: '$updatedAt' } } },
      { $sort: { customers: -1, lastUsed: -1 } },
      { $limit: 50 },
      { $project: { _id: 0, pocPhone: '$_id', pocName: 1, pocRole: 1, customers: 1 } },
    ]);
    res.json({ items });
  })
);

// one-time import of customers from existing valuations (safe to repeat)
router.post(
  '/import',
  requireSuperadmin,
  asyncHandler(async (req, res) => {
    const result = await importCustomersFromValuations(req.user);
    await logActivity(req, 'customer.imported', { entityType: 'customer', summary: `Imported ${result.created} customers from ${result.linked} input sheets` });
    res.json(result);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const c = await load(req.params.id, req);
    // evaluators see only their own sheets for the customer, and no reports
    const valuations = await Valuation.find({ customer: c._id, ...(fullAccess(req) ? {} : { evaluator: req.user._id }) })
      .sort({ createdAt: -1 })
      .select('referenceNo status data results.summary results.context summary evaluator createdAt updatedAt submittedAt reviewedAt reviewNote reportEditedAt')
      .populate('evaluator', 'name')
      .lean();
    const reports = !fullAccess(req) ? [] : await Report.find({ customer: c._id })
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
    const c = await load(req.params.id, req);
    const fields = withSource(pick(req.body));
    check({ ...c.toObject(), ...fields });
    const nextKey = customerKey({ ...c.toObject(), ...fields });
    if (nextKey !== c.matchKey) {
      const dupe = await Customer.findOne({ matchKey: nextKey, _id: { $ne: c._id } });
      if (dupe) throw dupeError(req, dupe, `${dupe.name} is already a customer with this phone number`);
    }
    Object.assign(c, fields);
    await c.save();
    await logActivity(req, 'customer.updated', { entityType: 'customer', entityId: c._id, summary: `Updated customer ${c.name}` });
    res.json(c);
  })
);

router.delete(
  '/:id',
  requireSuperadmin,
  asyncHandler(async (req, res) => {
    const c = await load(req.params.id);
    const count = await Valuation.countDocuments({ customer: c._id });
    if (count) throw new HttpError(409, 'This customer has input sheets and cannot be deleted');
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
    const c = await load(req.params.id, req);
    const { fromValuation, site } = req.body || {};
    // an evaluator always starts the sheet for themselves
    const evaluator = fullAccess(req) ? req.body?.evaluator : String(req.user._id);
    // `site` (new property): the address the evaluator will visit, copied into the sheet's "Property location"
    const SITE_FIELDS = ['description', 'numberType', 'number', 'surveyNo', 'street', 'village', 'localBodyType', 'localBodyName', 'district', 'pincode', 'landmark', 'location'];
    const siteFields = site && typeof site === 'object'
      ? Object.fromEntries(Object.entries(site).filter(([k, val]) => SITE_FIELDS.includes(k) && val !== '' && val != null))
      : null;
    if (!fromValuation && siteFields && !(siteFields.street || siteFields.village) ) throw new HttpError(422, 'Enter the site street or village so the evaluator can find it');
    if (!mongoose.isValidObjectId(evaluator)) throw new HttpError(422, 'Choose who will fill in the input sheet');
    const assignee = await User.findById(evaluator);
    if (!assignee || assignee.status !== 'active') throw new HttpError(422, 'That team member is not active');

    let previous = null;
    if (fromValuation) {
      if (!mongoose.isValidObjectId(fromValuation)) throw new HttpError(400, 'Invalid property');
      previous = await Valuation.findOne({ _id: fromValuation, customer: c._id, ...(fullAccess(req) ? {} : { evaluator: req.user._id }) }).select('data referenceNo').lean();
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
