/**
 * MongoDB Call Model
 *
 * Stores every call with full transcript and analysis.
 * categoryId links to the UserConfig.callCategories so we can pull
 * similar-category context when building future prompts.
 */

import mongoose from 'mongoose';

const callSchema = new mongoose.Schema({
  callId: { type: String, required: true, unique: true, index: true },
  userId: { type: String, default: 'default', index: true },
  phoneNumber: { type: String, required: true, index: true },   // caller's number
  direction: { type: String, enum: ['incoming', 'outgoing'], default: 'incoming' },
  status: {
    type: String,
    enum: ['in-progress', 'completed', 'failed', 'no-answer', 'cancelled'],
    default: 'completed'
  },
  duration: { type: Number, default: 0 },                        // seconds

  transcript: [{
    speaker: { type: String, enum: ['caller', 'ai'], required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
  }],

  analysis: {
    // Matched category id from UserConfig.callCategories (e.g. "delivery.food")
    categoryId: String,
    categoryLabel: String,          // human label, cached for display
    confidence: { type: Number, default: 0 },

    summary: String,                // 1-2 sentence summary
    sentiment: { type: String, enum: ['positive', 'neutral', 'negative'], default: 'neutral' },

    // Entities extracted from conversation
    callerName: String,
    organization: String,
    topic: String,

    // Action the AI took
    actionTaken: String,            // e.g. "Told delivery person to leave at door"

    urgency: { type: String, enum: ['low', 'normal', 'high', 'critical'], default: 'normal' },
    actionRequired: { type: Boolean, default: false },
    actionItems: [String]           // follow-up items if any
  },

  // Was the user connected mid-call?
  takenOver: { type: Boolean, default: false },
  takenOverAt: Date,

  startedAt: Date,
  endedAt: Date

}, { timestamps: true });

// Efficient queries for context retrieval
callSchema.index({ phoneNumber: 1, createdAt: -1 });
callSchema.index({ userId: 1, createdAt: -1 });
callSchema.index({ 'analysis.categoryId': 1, createdAt: -1 });

export default mongoose.model('Call', callSchema);
