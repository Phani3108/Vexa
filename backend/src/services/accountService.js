/**
 * Your data, your call (launch phase L7a, DPDP-ready basics).
 *
 *   exportAll()   everything Vexa holds about the account, as one JSON file
 *   deleteAll()   erases the account: calls, transcripts, recordings (files too),
 *                 caller memory, bookings, memories, family links, usage, push
 *                 devices and the account itself. Family members who were linked
 *                 are unlinked, and a guardian's number is removed from the
 *                 parent's VIPs. Cannot be undone.
 */

import UserConfig from '../models/mongodb/UserConfig.js';
import Call from '../models/mongodb/Call.js';
import Caller from '../models/mongodb/Caller.js';
import Booking from '../models/mongodb/Booking.js';
import Memory from '../models/mongodb/Memory.js';
import FamilyLink from '../models/mongodb/FamilyLink.js';
import UsageDay from '../models/mongodb/UsageDay.js';
import OtpCode from '../models/mongodb/OtpCode.js';
import { deleteRecordingFile } from '../lib/recorder.js';
import { phonesMatch } from '../lib/phone.js';

const strip = ({ _id, __v, ...rest }) => rest;

export async function exportAll(userId) {
  const user = await UserConfig.findOne({ userId }).lean();
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  const { deviceTokens, pushSubscriptions, googleSub, ...profile } = user;
  const [calls, callers, bookings, memories, family, usage] = await Promise.all([
    Call.find({ userId }).sort({ createdAt: -1 }).lean(),
    Caller.find({ userId }).lean(),
    Booking.find({ userId }).lean(),
    Memory.find({ userId }).lean(),
    FamilyLink.find({ $or: [{ dependantId: userId }, { guardianId: userId }] }).select('-codeHash').lean(),
    UsageDay.find({ userId }).lean()
  ]);
  return {
    exportedAt: new Date().toISOString(),
    format: 'vexa-export/v1',
    account: { ...strip(profile), devices: (deviceTokens?.length || 0) + (pushSubscriptions?.length || 0) },
    calls: calls.map(c => ({ ...strip(c), recording: c.recording ? { durationSec: c.recording.durationSec, note: 'Audio is downloadable from each call in the app' } : undefined })),
    callers: callers.map(strip),
    bookings: bookings.map(strip),
    memories: memories.map(strip),
    familyLinks: family.map(l => ({ role: l.dependantId === userId ? 'dependant' : 'guardian', status: l.status, share: l.share, consentAt: l.consentAt, acceptedAt: l.acceptedAt })),
    aiUsage: usage.map(strip)
  };
}

export async function deleteAll(userId) {
  const user = await UserConfig.findOne({ userId }).lean();
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  // Recording files first (the database rows point to them)
  const recorded = await Call.find({ userId, 'recording.file': { $exists: true } }).select('recording.file').lean();
  for (const c of recorded) deleteRecordingFile(c.recording.file);

  // Family: unlink both directions; take this guardian's number off each parent's VIP list
  const asGuardian = await FamilyLink.find({ guardianId: userId, status: 'active' }).lean();
  if (user.phoneNumber) {
    for (const l of asGuardian) {
      const dep = await UserConfig.findOne({ userId: l.dependantId }).select('vipContacts').lean();
      const keep = (dep?.vipContacts || []).filter(v => !(v.relationship === 'family (guardian)' && phonesMatch(v.phoneNumber, user.phoneNumber)));
      if (dep && keep.length !== (dep.vipContacts || []).length) await UserConfig.updateOne({ userId: l.dependantId }, { $set: { vipContacts: keep } });
    }
  }

  const counts = {};
  for (const [name, model, q] of [
    ['calls', Call, { userId }],
    ['callers', Caller, { userId }],
    ['bookings', Booking, { userId }],
    ['memories', Memory, { userId }],
    ['familyLinks', FamilyLink, { $or: [{ dependantId: userId }, { guardianId: userId }] }],
    ['usageDays', UsageDay, { userId }],
    ['loginCodes', OtpCode, user.phoneNumber ? { phoneNumber: user.phoneNumber } : { _id: null }]
  ]) counts[name] = (await model.deleteMany(q)).deletedCount;
  counts.recordings = recorded.length;
  await UserConfig.deleteOne({ userId });
  counts.account = 1;
  console.log(`🗑️  Account deleted (${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')})`);
  return { deleted: true, counts };
}

export default { exportAll, deleteAll };
