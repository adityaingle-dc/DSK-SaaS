import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// superadmin ⊃ admin (valuer / reviewer) ⊃ evaluator (field staff)
export const ROLES = ['superadmin', 'admin', 'evaluator'];
// pending = self-registered, waiting for superadmin approval
export const USER_STATUSES = ['pending', 'active', 'disabled'];

export const isSuperadmin = (user) => user?.role === 'superadmin';
export const isReviewer = (user) => user?.role === 'admin' || user?.role === 'superadmin';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 200 },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ROLES, default: 'evaluator', index: true },
    status: { type: String, enum: USER_STATUSES, default: 'active', index: true },
    phone: { type: String, trim: true, maxlength: 20 },
    branch: { type: String, trim: true, maxlength: 120 },
    employeeId: { type: String, trim: true, maxlength: 60 },
    mustChangePassword: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    lastLoginAt: Date,
    lastActiveAt: Date,
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
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
