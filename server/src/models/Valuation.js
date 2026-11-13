import mongoose from 'mongoose';
import { computeValuation, personName, phones } from '@dsk/shared';

export const STATUSES = ['draft', 'submitted', 'approved', 'rejected'];

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
    submittedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    reviewNote: String,
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
  this.markModified('data');
  this.markModified('results');
};

valuationSchema.pre('save', function assignReference(next) {
  if (!this.referenceNo) {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    this.referenceNo = `DSK-${ymd}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  }
  next();
});

export default mongoose.model('Valuation', valuationSchema);
