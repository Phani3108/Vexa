/**
 * MongoDB Caller Model
 *
 * One document per (userId, phoneNumber) pair.
 * Stores aggregated information learned from previous calls.
 * Used to pre-populate context before a new call begins.
 */

import mongoose from 'mongoose';

const callerSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  phoneNumber: { type: String, required: true, index: true },

  // Discovered info
  callerName: { type: String, default: 'Unknown' },
  organization: String,                     // e.g. "Swiggy", "Amazon"
  relationship: String,                     // e.g. "delivery", "personal", "business"

  // Most recent category detected for this caller
  // Useful to pre-load category context on subsequent calls
  lastCategoryId: String,                   // e.g. "delivery.food"
  lastCategoryLabel: String,

  // Aggregates
  totalCalls: { type: Number, default: 0 },
  lastCallAt: Date,

  // Short narrative summary built from past calls
  // Inserted into AI prompt as "what we know about this caller"
  contextSummary: String,

  // Free-form notes added by the user
  notes: String,

  // Custom tags set by the user (e.g. ["trusted", "noisy"])
  tags: [String]

}, { timestamps: true });

// Each user has their own caller profile for a given phone number
callerSchema.index({ userId: 1, phoneNumber: 1 }, { unique: true });

export default mongoose.model('Caller', callerSchema);
