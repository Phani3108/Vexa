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
  userId: { type: String, required: true, index: true },
  phoneNumber: { type: String, required: true, index: true },   // the other party's number
  direction: { type: String, enum: ['incoming', 'outgoing'], default: 'incoming' },
  status: {
    type: String,
    enum: ['in-progress', 'completed', 'failed', 'no-answer', 'busy', 'canceled', 'cancelled', 'blocked'],
    default: 'completed'
  },
  duration: { type: Number, default: 0 },                        // seconds

  // true for calls made from the dashboard "Test your receptionist" simulator
  isTest: { type: Boolean, default: false, index: true },

  transcript: [{
    speaker: { type: String, enum: ['caller', 'ai', 'system'], required: true },
    text: { type: String, required: true },     // exactly what was said, in the language it was said
    lang: { type: String, default: 'en' },       // en | hi | te | ta | ml | mr | gu | es
    textEn: String,                              // English rendering (same as text when lang = en)
    timestamp: { type: Date, default: Date.now }
  }],

  analysis: {
    // Matched category id from UserConfig.callCategories (e.g. "delivery.food")
    categoryId: String,
    categoryLabel: String,          // human label, cached for display
    confidence: { type: Number, default: 0 },

    summary: String,                // 1-2 sentence summary (English)
    summaryLocal: { lang: String, text: String },   // same summary in the caller's language
    sentiment: { type: String, enum: ['positive', 'neutral', 'negative'], default: 'neutral' },

    // Entities extracted from conversation
    callerName: String,
    organization: String,
    topic: String,

    // Action the AI took
    actionTaken: String,            // e.g. "Told delivery person to leave at door"

    urgency: { type: String, enum: ['low', 'normal', 'high', 'critical'], default: 'normal' },
    actionRequired: { type: Boolean, default: false },
    actionItems: [String],          // follow-up items if any

    isSpam: { type: Boolean, default: false },

    // SME lead capture — a potential or existing customer who needs a response
    lead: {
      isLead: { type: Boolean, default: false },
      name: String,
      callbackNumber: String,
      need: String,                 // what they want, in one line
      preferredTime: String,        // "tomorrow morning", "after 5pm"
      value: { type: String, enum: ['low', 'medium', 'high', null], default: null }
    }
  },

  // What the multi-turn flow engine did on this call
  workflowRun: {
    workflowId: String,
    workflowName: String,
    status: { type: String, enum: ['completed', 'transferred', 'abandoned'] },
    slots: mongoose.Schema.Types.Mixed,
    slotLabels: mongoose.Schema.Types.Mixed,
    turns: Number,
    questionsAsked: Number,
    slotsSkipped: Number,
    durationMs: Number,
    risk: { score: Number, level: String, reasons: [String] },
    actions: [mongoose.Schema.Types.Mixed],
    events: [mongoose.Schema.Types.Mixed]
  },

  // Languages used on the call (always includes 'en' for the English transcript)
  languages: { type: [String], default: ['en'] },
  // On-demand transcript translations: { te: { lines: [...], summary } }
  translations: { type: mongoose.Schema.Types.Mixed },

  // Call recording (dual channel: left = caller, right = Vexa / you)
  recording: {
    file: String,           // storage key (never exposed directly)
    durationSec: Number,
    sizeBytes: Number,
    channels: Number,
    sampleRate: Number,
    startedAt: Date,
    source: { type: String, enum: ['media-stream', 'upload'] }
  },

  // What the AI cost on this call (tokens + USD), per request and per purpose
  aiUsage: { type: mongoose.Schema.Types.Mixed },

  // Owner instructions sent while the call was live ("tell them I'll call back")
  whispers: [{ text: String, at: Date }],

  // Owner's follow-up workflow (inbox)
  followUp: {
    status: { type: String, enum: ['none', 'new', 'in_progress', 'done'], default: 'none', index: true },
    note: String,
    updatedAt: Date
  },

  // Was the user connected mid-call?
  takenOver: { type: Boolean, default: false },
  takenOverAt: Date,

  startedAt: Date,
  endedAt: Date

}, { timestamps: true });

// Efficient queries for context retrieval
callSchema.index({ userId: 1, phoneNumber: 1, createdAt: -1 });
callSchema.index({ userId: 1, createdAt: -1 });
callSchema.index({ userId: 1, 'analysis.categoryId': 1, createdAt: -1 });
callSchema.index({ userId: 1, 'followUp.status': 1, createdAt: -1 });

export default mongoose.model('Call', callSchema);
