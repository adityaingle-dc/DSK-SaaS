import mongoose from 'mongoose';
import { nextId } from '../services/ids.js';
import { computeValuation, personName, phones, validate, VALUATION_STATUSES, EVALUATOR_EDITABLE } from '@dsk/shared';

// The workflow (see @dsk/shared workflow.js): draft (evaluator) → submitted (drafters' queue) → received (a drafter
// took it) → pending (report generated, waiting for the superadmin) → approved (final, locked).
// rejected = the drafter sent it back to the evaluator · returned = the superadmin sent the report back to the drafter.
export const STATUSES = VALUATION_STATUSES;
export { EVALUATOR_EDITABLE };

// The input sheet itself lives in `data` (shape defined by @dsk/shared formSchema – sanitised before save).
// `results` is always recomputed server-side from `data`, never trusted from the client.
// `summary` is a denormalised projection for listing, searching and dashboards.
const valuationSchema = new mongoose.Schema(
  {
    referenceNo: { type: String, unique: true, index: true },
    data: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    results: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    summary: {
      applicantName: String,
      phone: String,
      bankName: String,
      branch: String,
      propertyType: String,
      loanType: String,
      loanCategory: String,
      district: String,
      kind: String,
      reportTemplate: String,
      fairMarketValue: Number,
      valuationDate: String,
    },
    status: { type: String, enum: STATUSES, default: 'draft', index: true },
    evaluator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // the service the customer asked for with this job (Site Visit · Building Permission · Valuation)
    service: { type: String, trim: true, maxlength: 60 },
    // sheet fields filled from the customer that can't be changed on the sheet (e.g. 'general.bankName'); they follow
    // the customer's details instead
    lockedFields: { type: [String], default: undefined },
    // reused site inspection: the sheet this one was started from ("Use for another report"), and every sheet before it
    // (their photos and documents are shared with this sheet, they stay attached to the sheet they were taken on)
    basedOn: { type: mongoose.Schema.Types.ObjectId, ref: 'Valuation' },
    sources: { type: [mongoose.Schema.Types.ObjectId], default: undefined },
    // the customer this job is for (Customers module); linked automatically by applicant phone/name
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', index: true },
    // task tracking for the evaluator's dashboard
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedAt: Date,
    startedAt: Date, // first time the assigned evaluator saved the sheet
    submittedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    reviewNote: String,
    // the drafter: took the sheet from the queue by opening it first (the superadmin can reassign it)
    drafter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    receivedAt: Date, // when the drafter took it
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAfterReceived: Boolean, // legacy
    reportedAt: Date, // last report generated from it (sent for approval)
    // the superadmin's decision on the latest report
    returnNote: String, // why the report was sent back to the drafter
    returnedAt: Date,
    returnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // complete = every required field of the sheet is filled in (needed to generate the report)
    draftReady: { type: Boolean, default: false, index: true },
    draftMissing: { type: Number, default: 0 },
    checkVersion: Number, // 2: draftReady / draftMissing checked against the whole sheet
    draftUpdatedAt: Date,
    // Superadmin wording/value edits applied on the printed bank report only (key -> text); data & results untouched
    reportOverrides: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    reportEditedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reportEditedAt: Date,
    // schemaVersion lets us migrate stored sheets when the workbook format changes (e.g. "CB Format 2027")
    schemaVersion: { type: Number, default: 1 },
  },
  { timestamps: true, minimize: false }
);

valuationSchema.index({ 'summary.applicantName': 1 });
valuationSchema.index({ 'summary.bankName': 1, 'summary.branch': 1 });

valuationSchema.methods.recompute = function recompute() {
  const d = this.data || {};
  this.results = computeValuation(d);
  this.summary = {
    applicantName: personName(d.applicant),
    phone: phones(d.applicant),
    bankName: d.general?.bankName,
    branch: d.general?.branch,
    propertyType: d.general?.propertyType,
    loanType: d.general?.loanType,
    loanCategory: d.general?.loanCategory,
    district: d.property?.district,
    kind: this.results.summary.kind,
    reportTemplate: this.results.summary.reportTemplate,
    fairMarketValue: this.results.summary.fairMarketValue,
    valuationDate: d.general?.valuationDate,
  };
  const missing = validate(d, { mode: 'submit' });
  this.draftReady = missing.length === 0;
  this.draftMissing = missing.length;
  this.checkVersion = 2;
  this.markModified('data');
  this.markModified('results');
};

// input sheet number, e.g. DSK-INP-0001 (existing sheets keep their earlier numbers)
valuationSchema.pre('save', async function assignReference(next) {
  if (!this.referenceNo) this.referenceNo = await nextId('inp');
  next();
});

export default mongoose.model('Valuation', valuationSchema);
