/**
 * Family guardian: a dependant (e.g. a parent) lets a guardian (e.g. their son)
 * see what Vexa does on their calls. The dependant creates the invite and
 * chooses what is shared — that is their recorded consent — and can revoke it.
 */

import mongoose from 'mongoose';

const familyLinkSchema = new mongoose.Schema({
  dependantId: { type: String, required: true, index: true },
  guardianId: { type: String, default: null, index: true },
  status: { type: String, enum: ['pending', 'active', 'revoked'], default: 'pending' },
  codeHash: { type: String, default: null },
  codeExpires: { type: Date, default: null },
  share: {
    summaries: { type: Boolean, default: true },     // call summaries and outcomes
    scamAlerts: { type: Boolean, default: true },    // scam and emergency alerts, live
    recordings: { type: Boolean, default: false }    // transcripts and audio
  },
  consentAt: { type: Date, default: null },          // when the dependant created the invite with these choices
  acceptedAt: { type: Date, default: null },
  lastDigestAt: { type: Date, default: null }
}, { timestamps: true });

familyLinkSchema.index({ codeHash: 1 }, { sparse: true });

export default mongoose.models.FamilyLink || mongoose.model('FamilyLink', familyLinkSchema);
