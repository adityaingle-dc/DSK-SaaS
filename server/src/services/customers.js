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
