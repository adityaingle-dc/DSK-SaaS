import { Router } from 'express';
import mongoose from 'mongoose';
import { emptyValuation, propertyKey, sanitize, OPEN_STATUSES, SECTIONS, SERVICES, CUSTOMER_BANK_FIELDS, customerStageOf } from '@dsk/shared';
import Customer, { CONTACT_TYPES, CUSTOMER_SOURCES, POC_ROLES, SERVICE_REQUESTS, customerKey } from '../models/Customer.js';
import Valuation from '../models/Valuation.js';
import Report from '../models/Report.js';
import User, { isSuperadmin } from '../models/User.js';
import { protect, requireSuperadmin } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { logActivity, valuationMeta } from '../services/activity.js';
import { importCustomersFromValuations, sheetPrefillFromCustomer, syncCustomerToSheets } from '../services/customers.js';

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

const EDITABLE = ['contactType', 'pocName', 'pocPhone', 'pocRole', 'salutation', 'name', 'relation', 'relativeName', 'occupation', 'phone1', 'phone2', 'email', 'houseNo', 'street', 'locality', 'district', 'pincode', 'bankName', 'branch', 'ifsc', 'source', 'serviceRequest', 'notes'];
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

// service requested: Site Visit · Building Permission · Valuation (older customers may have an older name, or a
// purpose of valuation from before)
const generalField = (key) => SECTIONS.find((x) => x.key === 'general').fields.find((f) => f.key === key);
const PURPOSES = generalField('purpose').options;
const PROPERTY_TYPES = generalField('propertyType').options;
const REQUESTS = [...SERVICES, ...PURPOSES, ...SERVICE_REQUESTS];

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
    if (creating && !fields.serviceRequest) throw new HttpError(422, 'Choose the service requested');
  }
  if (fields.serviceRequest && !REQUESTS.includes(fields.serviceRequest)) throw new HttpError(422, 'Unknown service requested');
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
        open: { $sum: { $cond: [{ $in: ['$status', OPEN_STATUSES] }, 1, 0] } },
        totalValue: { $sum: { $ifNull: ['$summary.fairMarketValue', 0] } },
        latestStatus: { $first: '$status' },
        statuses: { $addToSet: '$status' },
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
  return Object.fromEntries(rows.map((r) => [String(r._id), { ...r, stage: customerStageOf(r.statuses), properties: props[String(r._id)]?.size || 0 }]));
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

    // stage, from the customer's jobs (one per customer: the earliest stage of their jobs, see @dsk/shared)
    const byCustomer = await Valuation.aggregate([
      { $match: { customer: { $ne: null }, ...sheetScope } },
      { $group: { _id: '$customer', statuses: { $addToSet: '$status' } } },
    ]);
    const idsIn = { site: [], drafting: [], approval: [], done: [] };
    for (const r of byCustomer) idsIn[customerStageOf(r.statuses)].push(r._id);
    const STAGES = {
      new: { _id: { $nin: byCustomer.map((r) => r._id) } },
      site: { _id: { $in: idsIn.site } },
      drafting: { _id: { $in: idsIn.drafting } },
      approval: { _id: { $in: idsIn.approval } },
      done: { _id: { $in: idsIn.done } },
      open: { _id: { $in: [...idsIn.site, ...idsIn.drafting, ...idsIn.approval] } }, // older links: any open job
    };
    const scoped = STAGES[stage] ? { $and: [filter, STAGES[stage]] } : filter;

    const sortSpec = sorting(req.query, { updated: 'updatedAt', name: 'name', created: 'createdAt' });
    const { page: pageNum, limit: lim, skip } = paging(req.query);
    const stageKeys = ['new', 'site', 'drafting', 'approval', 'done'];
    const [items, total, all, stageCounts, banks, districts] = await Promise.all([
      Customer.find(scoped).collation({ locale: 'en' }).sort(sortSpec).skip(skip).limit(lim),
      Customer.countDocuments(scoped),
      fullAccess(req) ? Customer.estimatedDocumentCount() : Customer.countDocuments(ownScope(req)),
      Promise.all(stageKeys.map((k) => Customer.countDocuments({ $and: [filter, STAGES[k]] }))),
      Customer.distinct('bankName', ownScope(req)),
      Customer.distinct('district', ownScope(req)),
    ]);
    const stats = await statsFor(items.map((c) => c._id), sheetScope);
    const unlinked = all === 0 && fullAccess(req) ? await Valuation.countDocuments({ $or: [{ customer: null }, { customer: { $exists: false } }] }) : 0;
    res.json({
      items: items.map((c) => ({ ...c.toJSON(), stats: stats[String(c._id)] || { total: 0, approved: 0, open: 0, totalValue: 0, properties: 0, stage: 'new' } })),
      total,
      page: pageNum,
      pages: Math.ceil(total / lim),
      sources: CUSTOMER_SOURCES,
      // counts per stage for the current search / filters (tab badges)
      stages: (() => {
        const by = Object.fromEntries(stageKeys.map((k, i) => [k, stageCounts[i]]));
        // open = in progress anywhere in the flow (site visit, drafting, awaiting approval)
        return { all: stageCounts.reduce((a, b) => a + b, 0), ...by, open: by.site + by.drafting + by.approval };
      })(),
      facets: { banks: options(banks), districts: options(districts) },
      unlinkedValuations: unlinked, // > 0 on a fresh install: offer the one-time import
    });
  })
);

// Add a customer. With `job` (the valuation request: property type, site address, bank, who inspects), the site
// inspection sheet is created at the same time, filled in from these details, and appears in Site Inspections.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const fields = withSource(pick(req.body));
    const job = req.body?.job && typeof req.body.job === 'object' ? req.body.job : null;
    if (job && !fields.serviceRequest && job.service) fields.serviceRequest = job.service;
    if (job) for (const k of ['bankName', 'branch', 'ifsc']) if (!fields[k] && job[k]) fields[k] = String(job[k]).trim();
    check(fields, { creating: true });
    const dupe = await Customer.findOne({ matchKey: customerKey(fields) });
    if (dupe) throw dupeError(req, dupe, fields.phone1 ? `${dupe.name} is already a customer with this phone number` : `${dupe.name} is already a customer (same name and contact person)`);
    // check the job before anything is saved
    // the job keeps the service when it is one of the current ones (older customers may carry an older name)
    const plan = job ? await planJob(req, null, { ...job, service: job.service || (SERVICES.includes(fields.serviceRequest) ? fields.serviceRequest : '') }) : null;
    const c = await Customer.create({ ...fields, createdBy: req.user._id });
    await logActivity(req, 'customer.created', { entityType: 'customer', entityId: c._id, summary: `Added customer ${c.name}` });
    if (!plan) return res.status(201).json(c);
    const valuation = await createJob(req, c, plan);
    res.status(201).json({ ...c.toJSON(), valuation });
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
      .select('referenceNo status data results.summary results.context summary evaluator createdAt updatedAt submittedAt reviewedAt reviewNote reportEditedAt draftReady draftMissing')
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
    const before = c.toObject();
    Object.assign(c, fields);
    await c.save();
    // the same details on their open input sheets follow the change
    const sheetsUpdated = await syncCustomerToSheets(c, before);
    await logActivity(req, 'customer.updated', { entityType: 'customer', entityId: c._id, summary: `Updated customer ${c.name}${sheetsUpdated ? ` (and ${sheetsUpdated} open sheet${sheetsUpdated === 1 ? '' : 's'})` : ''}` });
    res.json({ ...c.toJSON(), sheetsUpdated });
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

// The site inspection sheet for a job, filled in from the customer and the valuation request so nobody types the
// same details again: applicant (name, relation, phones, address), bank and branch, type of property, purpose of
// valuation, and the site address. `fromValuation` (optional) = re-value a property already on file: its location,
// boundaries and property type are copied from that earlier sheet.
const PROPERTY_SECTIONS = ['property', 'boundaries'];
const SITE_FIELDS = ['description', 'numberType', 'number', 'surveyNo', 'street', 'village', 'localBodyType', 'localBodyName', 'district', 'pincode', 'landmark', 'location'];
const clean = (x) => (typeof x === 'string' ? x.trim().slice(0, 300) : '');

// checks the request (who inspects, the site, the property) and works out what goes into the sheet
async function planJob(req, c, body = {}) {
  const { fromValuation, site } = body;
  // an evaluator always starts the sheet for themselves
  const evaluator = fullAccess(req) ? body.evaluator : String(req.user._id);
  const siteFields = site && typeof site === 'object'
    ? Object.fromEntries(Object.entries(site).filter(([k, val]) => SITE_FIELDS.includes(k) && val !== '' && val != null).map(([k, val]) => [k, k === 'location' ? val : clean(val)]))
    : null;
  const typedSite = siteFields ? Object.keys(siteFields).filter((k) => k !== 'location') : [];
  if (!fromValuation && typedSite.length && !(siteFields.street || siteFields.village)) throw new HttpError(422, 'Enter the site street or village so the evaluator can find it');
  if (siteFields?.location) { const { lat, lon } = siteFields.location; if (!(Number.isFinite(+lat) && Number.isFinite(+lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) delete siteFields.location; else siteFields.location = { lat: +lat, lon: +lon }; }
  if (!mongoose.isValidObjectId(evaluator)) throw new HttpError(422, 'Choose who will do the site inspection');
  const assignee = await User.findById(evaluator);
  if (!assignee || assignee.status !== 'active') throw new HttpError(422, 'That team member is not active');
  if (assignee.role === 'drafter') throw new HttpError(422, 'Choose a field evaluator for the site inspection (drafters complete the sheet after it).');
  const propertyType = clean(body.propertyType);
  if (propertyType && !PROPERTY_TYPES.includes(propertyType)) throw new HttpError(422, 'Unknown type of property');
  const purpose = clean(body.purpose);
  const service = clean(body.service);
  if (service && !SERVICES.includes(service)) throw new HttpError(422, 'Unknown service requested');
  const general = Object.fromEntries(Object.entries({
    propertyType, purpose: PURPOSES.includes(purpose) ? purpose : '', bankName: clean(body.bankName), branch: clean(body.branch), ifsc: clean(body.ifsc).toUpperCase(),
  }).filter(([, val]) => val));

  let previous = null;
  if (fromValuation && c) {
    if (!mongoose.isValidObjectId(fromValuation)) throw new HttpError(400, 'Invalid property');
    previous = await Valuation.findOne({ _id: fromValuation, customer: c._id, ...(fullAccess(req) ? {} : { evaluator: req.user._id }) }).select('data referenceNo').lean();
    if (!previous) throw new HttpError(404, "That property isn't on this customer's record");
  }
  return { assignee, siteFields, general, previous, service };
}

async function createJob(req, c, { assignee, siteFields, general, previous, service }) {
  const selfAssigned = String(assignee._id) === String(req.user._id);
  const data = emptyValuation();
  const prefill = sheetPrefillFromCustomer(c);
  data.applicant = { ...(data.applicant || {}), ...prefill.applicant };
  data.general = { ...(data.general || {}), ...prefill.general, ...general };
  if (!previous && siteFields) data.property = { ...(data.property || {}), ...siteFields };
  if (previous) {
    // the property's location and boundaries carry over; the old visit's photos don't (they belong to that sheet,
    // and a new visit takes its own)
    for (const key of PROPERTY_SECTIONS) {
      if (!previous.data?.[key]) continue;
      const { photos: _old, ...rest } = previous.data[key];
      data[key] = rest;
    }
    if (previous.data?.general?.propertyType && !general.propertyType) data.general.propertyType = previous.data.general.propertyType;
  }
  // taking the job yourself: it is started straight away (not waiting in anyone's "new" column)
  const clean = sanitize(data);
  // the bank details given with the customer are locked on the sheet (they follow the customer's details)
  const lockedFields = CUSTOMER_BANK_FIELDS.map(([path]) => path).filter((path) => { const [sec, key] = path.split('.'); return clean[sec]?.[key]; });
  const v = new Valuation({ data: clean, lockedFields: lockedFields.length ? lockedFields : undefined, service: service || undefined, evaluator: assignee._id, customer: c._id, assignedBy: req.user._id, assignedAt: new Date(), ...(selfAssigned ? { startedAt: new Date() } : {}) });
  v.recompute();
  await v.save();
  await logActivity(req, 'valuation.assigned', {
    entityType: 'valuation',
    entityId: v._id,
    summary: previous
      ? `Started re-valuation ${v.referenceNo} for ${c.name} (property from ${previous.referenceNo}) and assigned it to ${assignee.name}`
      : selfAssigned ? `Started ${v.referenceNo} for ${c.name} (doing the site inspection themselves)` : `Started ${v.referenceNo} for ${c.name} and assigned the site inspection to ${assignee.name}`,
    meta: { ...valuationMeta(v), assignee: assignee.name, customer: c.name, revaluationOf: previous?.referenceNo },
  });
  return { _id: v._id, referenceNo: v.referenceNo, evaluator: { _id: assignee._id, name: assignee.name }, self: selfAssigned };
}

// A new job for a customer already on file (another property, or a re-valuation)
router.post(
  '/:id/valuations',
  asyncHandler(async (req, res) => {
    const c = await load(req.params.id, req);
    const plan = await planJob(req, c, req.body || {});
    // no duplicate jobs by accident: any open sheet for this customer is shown first, with "create another" as a
    // deliberate second click
    if (!req.body?.allowDuplicate) {
      const open = await Valuation.find({ customer: c._id, status: { $in: OPEN_STATUSES }, ...(fullAccess(req) ? {} : { evaluator: req.user._id }) })
        .sort({ updatedAt: -1 }).limit(5).select('referenceNo status updatedAt evaluator data.property').populate('evaluator', 'name').lean();
      if (open.length) {
        const err = new HttpError(409, `${c.name} already has ${open.length === 1 ? 'an open input sheet' : `${open.length} open input sheets`}.`);
        err.data = {
          open: open.map((o) => ({
            _id: o._id, referenceNo: o.referenceNo, status: o.status, updatedAt: o.updatedAt,
            evaluator: o.evaluator ? { _id: o.evaluator._id, name: o.evaluator.name } : null,
            site: [o.data?.property?.number, o.data?.property?.street, o.data?.property?.village].filter(Boolean).join(', '),
          })),
        };
        throw err;
      }
    }
    if (plan.service && c.serviceRequest !== plan.service) { c.serviceRequest = plan.service; await c.save(); }
    res.status(201).json(await createJob(req, c, plan));
  })
);

export default router;
