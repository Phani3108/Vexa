/**
 * One-time login codes. Stored hashed; auto-expire via TTL index.
 */

import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true, index: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('OtpCode', otpSchema);
