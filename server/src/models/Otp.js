import mongoose from 'mongoose';

// One-time email codes: sign-in, account requests and password resets.
// Only a hash of the code is stored; records expire automatically (TTL index).
export const OTP_PURPOSES = ['login', 'register', 'reset'];

const otpSchema = new mongoose.Schema(
  {
    purpose: { type: String, enum: OTP_PURPOSES, required: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    codeHash: { type: String, required: true },
    // account request details (password already hashed) until the email is verified
    payload: { type: mongoose.Schema.Types.Mixed },
    attempts: { type: Number, default: 0 },
    sends: { type: Number, default: 1 },
    lastSentAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
  },
  { timestamps: true }
);

// kept a little past expiry (for rate limiting), then removed by MongoDB
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

export default mongoose.model('Otp', otpSchema);
