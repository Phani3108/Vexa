/**
 * AI spend per account per day (UTC), for the daily budget and the usage page.
 */

import mongoose from 'mongoose';

const usageDaySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  day: { type: String, required: true },          // YYYY-MM-DD (UTC)
  costUsd: { type: Number, default: 0 },
  requests: { type: Number, default: 0 },
  conversations: { type: Number, default: 0 },
  byPurpose: { type: Map, of: Number, default: {} },
  alerted80: { type: Boolean, default: false },
  alerted100: { type: Boolean, default: false }
}, { timestamps: true });

usageDaySchema.index({ userId: 1, day: 1 }, { unique: true });

export default mongoose.models.UsageDay || mongoose.model('UsageDay', usageDaySchema);
