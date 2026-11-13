import mongoose from 'mongoose';

// Uploaded document scan / photo. The binary lives in UPLOAD_DIR under a random storageKey;
// it is linked to a valuation when that valuation is saved (uploads happen before a new sheet has an id).
const attachmentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    valuation: { type: mongoose.Schema.Types.ObjectId, ref: 'Valuation', index: true, default: null },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    storageKey: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

attachmentSchema.methods.toRef = function toRef() {
  return { id: String(this._id), name: this.originalName, type: this.mimeType, size: this.size };
};

export default mongoose.model('Attachment', attachmentSchema);
