import Customer, { customerKey } from '../models/Customer.js';
import Valuation from '../models/Valuation.js';

// Fields shared 1:1 between a customer and the input sheet's "Applicant / owner" section
export const APPLICANT_FIELDS = ['salutation', 'name', 'relation', 'relativeName', 'occupation', 'phone1', 'phone2', 'houseNo', 'street', 'locality', 'district', 'pincode'];

const pickDefined = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj?.[k]]).filter(([, v]) => v !== undefined && v !== null && v !== ''));

// customer profile from a valuation's input sheet
export const customerFromValuation = (data = {}) => ({
  ...pickDefined(data.applicant, APPLICANT_FIELDS),
  ...pickDefined(data.general, ['bankName', 'branch']),
});

// input-sheet prefill from a customer profile
export const sheetPrefillFromCustomer = (c) => ({
  applicant: pickDefined(c, APPLICANT_FIELDS),
  general: pickDefined(c, ['bankName', 'branch']),
});

// The customer's details as they appear on the sheet: section → field → customer field
const SHEET_MAP = [
  ...APPLICANT_FIELDS.map((k) => ['applicant', k, k]),
  ['general', 'bankName', 'bankName'],
  ['general', 'branch', 'branch'],
  ['general', 'ifsc', 'ifsc'],
];
const BANK_PATHS = ['general.bankName', 'general.branch', 'general.ifsc'];
// sheets that can still take changes (not waiting for approval, not approved)
const SYNC_STATUSES = ['draft', 'rejected', 'submitted', 'received', 'returned'];

// After the customer is edited: carry the change into their open sheets. A sheet field is updated when it is locked
// (the bank details given with the customer), empty, or still shows the customer's previous value; a value someone
// changed on the sheet itself is kept. Bank details given now are locked on the sheet from then on.
// before = the customer's fields before the edit. Returns the number of sheets updated.
export async function syncCustomerToSheets(customer, before) {
  const changed = SHEET_MAP.filter(([, , ck]) => String(before[ck] ?? '') !== String(customer[ck] ?? ''));
  if (!changed.length) return 0;
  const sheets = await Valuation.find({ customer: customer._id, status: { $in: SYNC_STATUSES } });
  let n = 0;
  for (const v of sheets) {
    const data = v.data || {};
    let touched = false;
    const locked = new Set(v.lockedFields || []);
    for (const [section, key, ck] of changed) {
      const path = `${section}.${key}`;
      const cur = data[section]?.[key];
      if (locked.has(path) || cur === undefined || cur === null || cur === '' || String(cur) === String(before[ck] ?? '')) {
        data[section] = { ...(data[section] || {}), [key]: customer[ck] ?? '' };
        touched = true;
        if (BANK_PATHS.includes(path)) { if (customer[ck]) locked.add(path); else locked.delete(path); }
      }
    }
    v.lockedFields = locked.size ? [...locked] : undefined;
    if (!touched) continue;
    v.data = data;
    v.recompute();
    await v.save();
    n += 1;
  }
  return n;
}

// Link a valuation to its customer (same phone, else same name); create the customer if there is none.
// Returns the customer, or null when the sheet has no applicant name/phone yet.
export async function linkCustomer(valuation, actor, { create = true } = {}) {
  if (valuation.customer) return null;
  const profile = customerFromValuation(valuation.data);
  const key = customerKey(profile);
  if (!key || !profile.name) return null;
  let customer = await Customer.findOne({ matchKey: key });
  if (!customer && create) {
    customer = await Customer.create({ ...profile, source: 'Existing customer', createdBy: actor?._id });
  }
  if (customer) valuation.customer = customer._id;
  return customer;
}

// One-time (and safe to repeat) import: link every unlinked valuation to a customer.
export async function importCustomersFromValuations(actor) {
  const before = await Customer.countDocuments();
  const unlinked = await Valuation.find({ $or: [{ customer: null }, { customer: { $exists: false } }] }).sort({ createdAt: 1 });
  let linked = 0;
  for (const v of unlinked) {
    const c = await linkCustomer(v, actor);
    if (c) {
      await Valuation.updateOne({ _id: v._id }, { $set: { customer: c._id } });
      linked += 1;
    }
  }
  const created = (await Customer.countDocuments()) - before;
  return { created, linked, skipped: unlinked.length - linked };
}
