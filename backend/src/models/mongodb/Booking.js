/**
 * Booking requests created by the booking / reschedule flows.
 * The AI never confirms a slot itself — the owner approves with one tap
 * and the caller gets a text.
 */

import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  callId: String,
  kind: { type: String, enum: ['new', 'reschedule', 'cancel'], default: 'new' },
  status: { type: String, enum: ['requested', 'confirmed', 'declined', 'cancelled'], default: 'requested', index: true },
  customerName: String,
  phoneNumber: String,
  service: String,
  requestedTime: String,          // as the caller said it: "Friday 10am"
  requestedAt: Date,              // best-effort parse, for sorting
  confirmedTime: String,
  note: String
}, { timestamps: true });

bookingSchema.index({ userId: 1, status: 1, createdAt: -1 });

export default mongoose.model('Booking', bookingSchema);
