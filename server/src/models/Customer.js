import mongoose from 'mongoose';
import { nextId } from '../services/ids.js';

// A customer is the entry point for work: someone contacts the superadmin and asks for a valuation.
// Profile fields mirror the "Applicant / owner" section of the input sheet so a new sheet can be prefilled 1:1.
export const CUSTOMER_SOURCES = ['Walk-in', 'Phone call', 'Bank referral', 'Existing customer', 'Website', 'Contact person', 'Other'];
// what the customer wants done
export const SERVICE_REQUESTS = ['Home loan valuation', 'Loan against property', 'Plot / land valuation', 'Construction stage valuation', 'Purchase / resale valuation', 'Other'];
// individual: the customer contacts us directly · poc: a middle person (point of contact) brings the customer
export const CONTACT_TYPES = ['individual', 'poc'];
export const POC_ROLES = ['Agent / broker', 'Bank officer', 'Builder', 'Relative', 'Other'];

const customerSchema = new mongoose.Schema(
  {
    // system ID, e.g. DSK-CIN-0001 (assigned on creation)
    code: { type: String, unique: true, sparse: true, index: true },
    contactType: { type: String, enum: CONTACT_TYPES, default: 'individual' },
    // the middle person who brought the customer (contactType = 'poc')
    pocName: { type: String, trim: true, maxlength: 160 },
    pocPhone: { type: String, trim: true, maxlength: 20 },
    pocRole: { type: String, enum: [...POC_ROLES, ''], default: '' },
    salutation: { type: String, trim: true, maxlength: 20, default: 'Sri.' },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    relation: { type: String, trim: true, maxlength: 20 },
    relativeName: { type: String, trim: true, maxlength: 160 },
    occupation: { type: String, trim: true, maxlength: 120 },
    phone1: { type: String, trim: true, maxlength: 20 },
    phone2: { type: String, trim: true, maxlength: 20 },
    email: { type: String, trim: true, lowercase: true, maxlength: 200 },
    houseNo: { type: String, trim: true, maxlength: 80 },
    street: { type: String, trim: true, maxlength: 200 },
    locality: { type: String, trim: true, maxlength: 200 },
    district: { type: String, trim: true, maxlength: 120 },
    pincode: { type: String, trim: true, maxlength: 10 },
    // the bank that will receive the report
    bankName: { type: String, trim: true, maxlength: 160 },
    branch: { type: String, trim: true, maxlength: 160 },
    source: { type: String, enum: CUSTOMER_SOURCES, default: 'Phone call' },
    serviceRequest: { type: String, enum: [...SERVICE_REQUESTS, ''], default: '' },
    notes: { type: String, trim: true, maxlength: 2000 },
    // normalised key used to match valuations to customers (last 10 digits of phone, else the name)
    matchKey: { type: String, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

customerSchema.index({ name: 1 });

export const phoneDigits = (p) => String(p || '').replace(/\D/g, '').slice(-10);
export const customerKey = ({ phone1, phone2, name, pocPhone } = {}) => {
  const digits = phoneDigits(phone1) || phoneDigits(phone2);
  if (digits.length >= 10) return `p:${digits}`;
  const n = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  // no own phone: the same name brought by the same contact person is the same customer
  const poc = phoneDigits(pocPhone);
  if (n && poc.length >= 10) return `c:${n}|${poc}`;
  return n ? `n:${n}` : '';
};

customerSchema.pre('save', async function assignCode(next) {
  if (!this.code) this.code = await nextId('cin');
  next();
});

customerSchema.pre('save', function setKey(next) {
  this.matchKey = customerKey(this);
  next();
});

customerSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

export default mongoose.model('Customer', customerSchema);
