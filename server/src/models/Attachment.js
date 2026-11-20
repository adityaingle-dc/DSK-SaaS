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
    // camera photo taken in the app: where and when (also stamped on the image itself)
    gps: { lat: Number, lon: Number, accuracy: Number, takenAt: Date },
  },
  { timestamps: true }
);

attachmentSchema.methods.toRef = function toRef() {
  const ref = { id: String(this._id), name: this.originalName, type: this.mimeType, size: this.size };
  if (this.gps?.lat != null && this.gps?.lon != null) {
    ref.gps = { lat: this.gps.lat, lon: this.gps.lon, ...(this.gps.accuracy != null ? { accuracy: this.gps.accuracy } : {}), ...(this.gps.takenAt ? { takenAt: this.gps.takenAt.toISOString() } : {}) };
  }
  return ref;
};

export default mongoose.model('Attachment', attachmentSchema);
