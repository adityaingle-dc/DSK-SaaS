import mongoose from 'mongoose';

// Audit trail of everything users do. Written by services/activity.js, read by the superadmin.
export const ACTIONS = [
  'auth.login',
  'auth.login_failed',
  'auth.register',
  'auth.password_changed',
  'valuation.created',
  'valuation.updated',
  'valuation.submitted',
  'valuation.approved',
  'valuation.rejected',
  'valuation.deleted',
  'valuation.report_edited',
  'file.uploaded',
  'file.deleted',
  'user.created',
  'user.updated',
  'user.approved',
  'user.disabled',
  'user.enabled',
  'user.password_reset',
];

const activitySchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, // null for failed logins
    actorName: String, // denormalised so the log stays readable if a user is renamed
    actorRole: String,
    action: { type: String, enum: ACTIONS, required: true, index: true },
    entityType: { type: String, enum: ['valuation', 'file', 'user', 'auth'] },
    entityId: { type: mongoose.Schema.Types.ObjectId },
    summary: { type: String, maxlength: 300 }, // human-readable one-liner
    meta: { type: mongoose.Schema.Types.Mixed },
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

activitySchema.index({ createdAt: -1 });
activitySchema.index({ actor: 1, createdAt: -1 });
activitySchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

export default mongoose.model('ActivityLog', activitySchema);
