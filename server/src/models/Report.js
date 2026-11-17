import mongoose from 'mongoose';

// Report types that can be generated from an input sheet. One today; more will be added later
// (each needs a layout on the client – see client/src/report).
export const REPORT_TYPES = [
  {
    key: 'bank',
    title: 'Bank valuation report',
    description: 'The bank format (certificate, annexure, valuation sheets and photos). The layout — plot, land & building, flat or purchase — is chosen automatically from the input sheet.',
  },
];
export const REPORT_TYPE_KEYS = REPORT_TYPES.map((t) => t.key);

// A generated report is stored as a frozen copy of the input sheet at the time it was generated,
// so it always prints exactly as issued even if the sheet is edited later (generate a new version then).
const reportSchema = new mongoose.Schema(
  {
    reportNo: { type: String, unique: true, index: true }, // DSK-RPT-0001
    type: { type: String, enum: REPORT_TYPE_KEYS, required: true },
    version: { type: Number, default: 1 }, // 1, 2, 3… per input sheet + type
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', index: true },
    valuation: { type: mongoose.Schema.Types.ObjectId, ref: 'Valuation', required: true, index: true },
    snapshot: {
      referenceNo: String,
      status: String,
      data: { type: mongoose.Schema.Types.Mixed },
      results: { type: mongoose.Schema.Types.Mixed },
      evaluatorName: String,
      reviewedByName: String,
      reviewedAt: Date,
    },
    // denormalised for the list
    applicantName: String,
    reportTemplate: String,
    templateTitle: String,
    fairMarketValue: Number,
    propertyAddress: String,
    // wording edits made on this stored report (starts from the sheet's report edits at generation)
    overrides: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    editedAt: Date,
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, minimize: false }
);

reportSchema.index({ valuation: 1, type: 1, version: -1 });

export default mongoose.model('Report', reportSchema);
