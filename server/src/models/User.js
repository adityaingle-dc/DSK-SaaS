import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { nextId } from '../services/ids.js';

// superadmin (approves reports) · drafter (completes sheets in the office and generates the reports) ·
// evaluator (field staff: the site inspection) · admin (older Valuer / Reviewer accounts, treated like a superadmin)
export const ROLES = ['superadmin', 'admin', 'drafter', 'evaluator'];
// pending = self-registered, waiting for superadmin approval
export const USER_STATUSES = ['pending', 'active', 'disabled'];

export const isSuperadmin = (user) => user?.role === 'superadmin';
export const isReviewer = (user) => user?.role === 'admin' || user?.role === 'superadmin';
export const isDrafter = (user) => user?.role === 'drafter';
// office staff: see every handed-in sheet and the reports
export const isOffice = (user) => isReviewer(user) || isDrafter(user);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 200 },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ROLES, default: 'evaluator', index: true },
    status: { type: String, enum: USER_STATUSES, default: 'active', index: true },
    phone: { type: String, trim: true, maxlength: 20 },
    branch: { type: String, trim: true, maxlength: 120 },
    // system ID, e.g. DSK-EMP-001 (assigned on creation)
    code: { type: String, unique: true, sparse: true, index: true },
    // legacy: employee number typed in before system IDs existed (still shown when present)
    employeeId: { type: String, trim: true, maxlength: 60 },
    mustChangePassword: { type: Boolean, default: false },
    emailVerifiedAt: Date, // set when the user first proves the mailbox with an emailed code
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    lastLoginAt: Date,
    lastActiveAt: Date,
  },
  { timestamps: true }
);

userSchema.pre('save', async function assignCode(next) {
  if (!this.code) this.code = await nextId('emp');
  next();
});

userSchema.pre('save', async function hashPassword(next) {
  // $locals.passwordIsHash: hashed earlier (account request verified by email code)
  if (!this.isModified('password') || this.$locals.passwordIsHash) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.__v;
  return obj;
};

export default mongoose.model('User', userSchema);
