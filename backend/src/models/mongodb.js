/**
 * MongoDB Models for AI Caller
 */

import mongoose from 'mongoose';

// ============================================
// Call Schema - Stores all call records
// ============================================
const callSchema = new mongoose.Schema({
  callId: { type: String, required: true, unique: true, index: true },
  phoneNumber: { type: String, required: true, index: true },  // Caller's number
  twilioNumber: { type: String },  // Your Twilio number
  direction: { type: String, enum: ['incoming', 'outgoing'], default: 'incoming' },
  status: { type: String, default: 'completed' },
  
  // Timing
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date },
  duration: { type: Number, default: 0 },  // seconds
  
  // Transcript
  transcripts: [{
    speaker: { type: String, enum: ['user', 'assistant'] },
    text: String,
    timestamp: Date
  }],
  
  // AI Analysis
  analysis: {
    intent: { type: String, default: 'unknown' },
    summary: String,
    sentiment: { type: String, enum: ['positive', 'negative', 'neutral'], default: 'neutral' },
    confidence: { type: Number, default: 0.5 },
    callerName: String,
    organization: String,
    actionRequired: { type: Boolean, default: false },
    actionItems: [String],
    urgency: { type: String, enum: ['high', 'medium', 'low'], default: 'low' }
  },
  
  // For manually logged outgoing calls
  manuallyLogged: { type: Boolean, default: false },
  notes: String,
  outcome: String
  
}, { timestamps: true });

// Index for efficient queries
callSchema.index({ phoneNumber: 1, startTime: -1 });
callSchema.index({ startTime: -1 });

export const Call = mongoose.model('Call', callSchema);


// ============================================
// Caller Schema - Stores info about each caller
// ============================================
const callerSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true, unique: true, index: true },
  callerName: { type: String, default: 'Unknown' },
  organization: String,
  relationship: String,  // friend, family, work, vendor, spam, etc.
  notes: String,
  tags: [String],
  
  // Stats
  totalCalls: { type: Number, default: 0 },
  lastCallAt: Date,
  firstCallAt: Date,
  
  // Computed summary
  summary: String
  
}, { timestamps: true });

export const Caller = mongoose.model('Caller', callerSchema);


// ============================================
// User Schema - Stores user profile
// ============================================
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, default: 'default' },
  name: { type: String, required: true },
  about: String,
  phoneNumber: String,
  twilioNumber: String,
  
  // AI Preferences
  preferences: {
    aiVoice: { type: String, default: 'shimmer' },
    aiTone: { type: String, default: 'professional but friendly' },
    greeting: String,
    defaultAction: { type: String, default: 'screen' },
    escalateKeywords: [String],
    verbosity: { type: String, default: 'concise' }
  },
  
  // Availability
  availability: {
    timezone: String,
    workHours: String,
    currentStatus: { type: String, default: 'available' }
  },
  
  // Contacts (for future VIP handling)
  contacts: [{
    name: String,
    phoneNumber: String,
    relationship: String,
    isVIP: Boolean
  }]
  
}, { timestamps: true });

export const User = mongoose.model('User', userSchema);
