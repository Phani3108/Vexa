/**
 * What Vexa remembers from calls for the owner: promises made to them
 * ("the bank will call back Monday"), quotes ("₹1,800 for the gas refill") and
 * facts worth keeping. Promises with a due time become reminders.
 */

import mongoose from 'mongoose';

const memorySchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  kind: { type: String, enum: ['promise', 'quote', 'fact'], required: true },
  text: { type: String, required: true, maxlength: 300 },
  who: { type: String, default: null, maxlength: 80 },
  amount: { type: Number, default: null },
  dueAt: { type: Date, default: null },
  status: { type: String, enum: ['open', 'done', 'dismissed'], default: 'open' },
  remindedAt: { type: Date, default: null },
  callId: { type: String, default: null },
  phoneNumber: { type: String, default: null },
  isTest: { type: Boolean, default: false }
}, { timestamps: true });

memorySchema.index({ status: 1, dueAt: 1, remindedAt: 1 });
memorySchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.Memory || mongoose.model('Memory', memorySchema);
