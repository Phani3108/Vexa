/**
 * Family guardian (linked accounts).
 *
 *   invite()   dependant creates a 6-digit code (24 h) and chooses what to share
 *   accept()   guardian enters the code → link active; the guardian's number
 *              is added to the dependant's VIPs so family always rings through
 *   alert()    scam and emergency alerts on the dependant's calls reach every
 *              guardian (push + live socket), if the dependant shares them
 *   calls()    the guardian's view: summaries only, transcripts only if shared
 *   digest     once a day after 8 pm (dependant's time): "Amma: 5 calls, 1 scam blocked"
 *
 * Either side can end the link; only the dependant changes what is shared.
 */

import crypto from 'crypto';
import FamilyLink from '../models/mongodb/FamilyLink.js';
import UserConfig from '../models/mongodb/UserConfig.js';
import Call from '../models/mongodb/Call.js';
import { isMongoConnected } from '../config/mongodb.js';
import { phonesMatch } from '../lib/phone.js';
import { notifyUser } from './pushNotificationService.js';

const CODE_TTL_MS = 24 * 3600 * 1000;
const MAX_LINKS = 5;
const hash = code => crypto.createHash('sha256').update(`vexa-family:${code}`).digest('hex');
const err = (status, message) => Object.assign(new Error(message), { status });
const firstName = u => String(u?.name || 'Your family member').split(' ')[0];

let ioRef = null;
export function attachIO(io) { ioRef = io; }

function shareOf(s = {}) {
  return { summaries: s.summaries !== false, scamAlerts: s.scamAlerts !== false, recordings: s.recordings === true };
}

export async function overview(userId) {
  const links = await FamilyLink.find({ $or: [{ dependantId: userId }, { guardianId: userId }], status: { $ne: 'revoked' } }).lean();
  const ids = [...new Set(links.flatMap(l => [l.dependantId, l.guardianId]).filter(Boolean))];
  const users = await UserConfig.find({ userId: { $in: ids } }).select('userId name phoneNumber').lean();
  const who = id => { const u = users.find(x => x.userId === id); return u ? { userId: u.userId, name: u.name, phoneNumber: u.phoneNumber || null } : null; };
  return {
    guardians: links.filter(l => l.dependantId === userId && l.status === 'active').map(l => ({ linkId: String(l._id), ...who(l.guardianId), share: l.share, since: l.acceptedAt })),
    dependants: links.filter(l => l.guardianId === userId && l.status === 'active').map(l => ({ linkId: String(l._id), ...who(l.dependantId), share: l.share, since: l.acceptedAt })),
    pendingInvite: links.filter(l => l.dependantId === userId && l.status === 'pending' && l.codeExpires > new Date()).map(l => ({ linkId: String(l._id), expiresAt: l.codeExpires, share: l.share }))[0] || null
  };
}

export async function invite(userId, share) {
  const active = await FamilyLink.countDocuments({ dependantId: userId, status: 'active' });
  if (active >= MAX_LINKS) throw err(400, `At most ${MAX_LINKS} family members can be linked`);
  await FamilyLink.deleteMany({ dependantId: userId, status: 'pending' });
  const code = String(crypto.randomInt(100000, 1000000));
  const link = await FamilyLink.create({ dependantId: userId, codeHash: hash(code), codeExpires: new Date(Date.now() + CODE_TTL_MS), share: shareOf(share), consentAt: new Date() });
  return { code, expiresAt: link.codeExpires, linkId: String(link._id) };
}

export async function accept(guardianId, code) {
  const clean = String(code || '').replace(/\D/g, '');
  if (clean.length !== 6) throw err(400, 'Enter the 6-digit code');
  const link = await FamilyLink.findOne({ codeHash: hash(clean), status: 'pending', codeExpires: { $gt: new Date() } });
  if (!link) throw err(404, 'That code is wrong or has expired. Ask for a new one.');
  if (link.dependantId === guardianId) throw err(400, 'You can\'t link your own account');
  const dup = await FamilyLink.exists({ dependantId: link.dependantId, guardianId, status: 'active' });
  if (dup) throw err(409, 'You are already linked');
  link.guardianId = guardianId;
  link.status = 'active';
  link.codeHash = null;
  link.acceptedAt = new Date();
  await link.save();

  // Family always rings through: the guardian becomes one of the dependant's VIPs
  const [dependant, guardian] = await Promise.all([UserConfig.findOne({ userId: link.dependantId }).lean(), UserConfig.findOne({ userId: guardianId }).lean()]);
  if (guardian?.phoneNumber && !(dependant?.vipContacts || []).some(v => phonesMatch(v.phoneNumber, guardian.phoneNumber))) {
    await UserConfig.updateOne({ userId: link.dependantId }, { $push: { vipContacts: { name: guardian.name || 'Family', phoneNumber: guardian.phoneNumber, relationship: 'family (guardian)', notes: 'Linked in Vexa Family' } } });
  }
  notifyUser(link.dependantId, { title: 'Family link added', body: `${firstName(guardian)} can now see your call summaries and scam alerts. You can remove this any time in Me → Family.`, type: 'family' }).catch(() => {});
  return overview(guardianId);
}

export async function updateShare(userId, linkId, share) {
  const link = await FamilyLink.findOneAndUpdate({ _id: linkId, dependantId: userId, status: { $ne: 'revoked' } }, { $set: { share: shareOf(share), consentAt: new Date() } }, { new: true }).lean();
  if (!link) throw err(404, 'Link not found');
  return overview(userId);
}

export async function remove(userId, linkId) {
  const link = await FamilyLink.findOne({ _id: linkId, $or: [{ dependantId: userId }, { guardianId: userId }] });
  if (!link) throw err(404, 'Link not found');
  link.status = 'revoked';
  link.codeHash = null;
  await link.save();
  return overview(userId);
}

async function activeLink(guardianId, dependantId) {
  const link = await FamilyLink.findOne({ guardianId, dependantId, status: 'active' }).lean();
  if (!link) throw err(404, 'You are not linked to this account');
  return link;
}

/** The guardian's view of a dependant's calls: what the dependant chose to share. */
export async function calls(guardianId, dependantId, limit = 30) {
  const link = await activeLink(guardianId, dependantId);
  if (!link.share.summaries && !link.share.scamAlerts) return { calls: [], share: link.share };
  // Test calls are included (marked), so a parent can check the setup with one
  const q = { userId: dependantId };
  if (!link.share.summaries) q['analysis.scam'] = { $ne: null };   // alerts only
  const rows = await Call.find(q).sort({ createdAt: -1 }).limit(Math.min(100, limit)).lean();
  return {
    share: link.share,
    calls: rows.map(c => ({
      callId: c.callId,
      at: c.createdAt,
      from: c.analysis?.callerName || c.phoneNumber,
      summary: c.analysis?.summary || '',
      category: c.analysis?.categoryLabel || null,
      scam: c.analysis?.scam ? { label: c.analysis.scam.label, phrases: c.analysis.scam.phrases } : null,
      urgent: c.analysis?.urgency === 'critical',
      test: !!c.isTest,
      ...(link.share.recordings ? { transcript: (c.transcript || []).map(t => ({ speaker: t.speaker, text: t.textEn || t.text })) } : {})
    }))
  };
}

/** Scam or emergency on a dependant's call → every guardian who is sent alerts. */
export async function alert(dependant, { kind, callId, label, phrase, detail, test = false }) {
  if (!isMongoConnected()) return;
  const links = await FamilyLink.find({ dependantId: dependant.userId, status: 'active', 'share.scamAlerts': true }).lean();
  const name = firstName(dependant);
  for (const l of links) {
    const title = `${test ? 'Test — ' : ''}${kind === 'scam' ? `🛡️ Scam call to ${name} blocked` : `🚨 Emergency call for ${name}`}`;
    const body = kind === 'scam' ? `${label || 'Likely scam'}${phrase ? `: “${String(phrase).slice(0, 90)}”` : ''}. Vexa shared nothing.` : (detail || 'Vexa is alerting them now.');
    ioRef?.to(`user:${l.guardianId}`).emit('family:alert', { kind, dependantId: dependant.userId, dependantName: name, callId, title, body });
    notifyUser(l.guardianId, { title, body, type: `family_${kind}` }).catch(() => {});
  }
}

// ── Daily digest ─────────────────────────────────────────────────────────────

function localHour(tz, at = new Date()) {
  try { return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: tz || 'Asia/Kolkata' }).format(at)); } catch { return at.getUTCHours(); }
}

export async function sendDigests(now = new Date()) {
  if (!isMongoConnected()) return 0;
  const links = await FamilyLink.find({ status: 'active', 'share.summaries': true, $or: [{ lastDigestAt: null }, { lastDigestAt: { $lt: new Date(now - 20 * 3600 * 1000) } }] }).limit(200).lean();
  let sent = 0;
  for (const l of links) {
    const dep = await UserConfig.findOne({ userId: l.dependantId }).select('userId name businessProfile.timezone priorityTime.timezone').lean();
    if (!dep || localHour(dep.businessProfile?.timezone || dep.priorityTime?.timezone, now) < 20) continue;
    const since = new Date(now - 24 * 3600 * 1000);
    const rows = await Call.find({ userId: l.dependantId, isTest: { $ne: true }, createdAt: { $gte: since } }).select('analysis.scam analysis.isSpam analysis.urgency').lean();
    await FamilyLink.updateOne({ _id: l._id }, { $set: { lastDigestAt: now } });
    if (!rows.length) continue;
    const scams = rows.filter(c => c.analysis?.scam).length;
    const spam = rows.filter(c => c.analysis?.isSpam && !c.analysis?.scam).length;
    const parts = [`${rows.length} call${rows.length > 1 ? 's' : ''}`, scams && `${scams} scam${scams > 1 ? 's' : ''} blocked`, spam && `${spam} spam`].filter(Boolean);
    await notifyUser(l.guardianId, { title: `${firstName(dep)}'s calls today`, body: `${parts.join(' · ')}. Tap to read the summaries.`, type: 'family_digest' }).catch(() => {});
    sent++;
  }
  return sent;
}

export default { overview, invite, accept, updateShare, remove, calls, alert, sendDigests, attachIO };
