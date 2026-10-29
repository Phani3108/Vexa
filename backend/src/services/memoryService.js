/**
 * Memory and promises: what callers said that the owner may need later.
 *
 *   saveFromCall()  after every call: promises, quotes and facts from the analysis
 *   ask()           "What did the electrician quote?" — answered ONLY from saved
 *                   memories and recent call summaries, with the calls it used
 *   reminders loop  a promise whose time has passed → "Did SBI call back?" push
 *
 * Owner-only (every query is scoped by userId). Never stores anything from a
 * spam or scam call, and never OTPs, PINs or card numbers.
 */

import Memory from '../models/mongodb/Memory.js';
import Call from '../models/mongodb/Call.js';
import { isMongoConnected } from '../config/mongodb.js';
import { structuredJson, llmAvailable } from '../lib/llm.js';
import { nullableString, strictObject } from '../lib/claude.js';
import { notifyUser } from './pushNotificationService.js';

const SECRET = /\b(otp|pin|cvv|password|card number|account number|aadhaar|aadhar|\d{12,19})\b/i;
const STOP = new Set('a an the is are was were do does did you your we our i to for of in on at and or can could what when where how my me it this that be have has with about any who which much many'.split(' '));
const words = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w));

export async function saveFromCall(call, memories = []) {
  if (!isMongoConnected() || !call || call.analysis?.isSpam || call.analysis?.scam) return [];
  const rows = (memories || [])
    .filter(m => m && ['promise', 'quote', 'fact'].includes(m.kind) && m.text && !SECRET.test(m.text))
    .slice(0, 5)
    .map(m => {
      const due = m.due && !isNaN(new Date(m.due)) ? new Date(m.due) : null;
      return {
        userId: call.userId,
        kind: m.kind,
        text: String(m.text).slice(0, 300),
        who: m.who ? String(m.who).slice(0, 80) : call.analysis?.callerName || null,
        amount: Number.isFinite(Number(m.amount)) && m.amount !== null ? Number(m.amount) : null,
        dueAt: m.kind === 'promise' ? due : null,
        callId: call.callId,
        phoneNumber: /^\+\d{10,15}$/.test(call.phoneNumber || '') ? call.phoneNumber : null,
        isTest: !!call.isTest
      };
    });
  if (!rows.length) return [];
  return Memory.insertMany(rows);
}

export async function list(userId, { status = 'open', limit = 50 } = {}) {
  const q = { userId, ...(status === 'all' ? {} : { status }) };
  return Memory.find(q).sort({ dueAt: 1, createdAt: -1 }).limit(Math.min(200, limit)).lean();
}

export async function update(userId, id, { status }) {
  if (!['open', 'done', 'dismissed'].includes(status)) throw Object.assign(new Error('Invalid status'), { status: 400 });
  const m = await Memory.findOneAndUpdate({ _id: id, userId }, { $set: { status } }, { new: true }).lean();
  if (!m) throw Object.assign(new Error('Not found'), { status: 404 });
  return m;
}

export async function remove(userId, id) {
  await Memory.deleteOne({ _id: id, userId });
}

const ANSWER_SCHEMA = strictObject({
  answer: { type: 'string' },
  found: { type: 'boolean' },
  callIds: { type: 'array', items: { type: 'string' } },
  followUp: nullableString
});

/** Notes the answer may use: memories first, then recent call summaries. */
async function notesFor(userId) {
  const since = new Date(Date.now() - 120 * 86400000);
  const [memories, calls] = await Promise.all([
    Memory.find({ userId, createdAt: { $gte: since }, status: { $ne: 'dismissed' } }).sort({ createdAt: -1 }).limit(80).lean(),
    Call.find({ userId, createdAt: { $gte: since }, 'analysis.isSpam': { $ne: true } }).sort({ createdAt: -1 }).limit(60)
      .select('callId phoneNumber createdAt analysis.summary analysis.callerName analysis.lead.need analysis.lead.preferredTime isTest').lean()
  ]);
  return {
    memories: memories.map(m => ({ kind: m.kind, text: m.text, who: m.who, amount: m.amount, due: m.dueAt, status: m.status, callId: m.callId, date: m.createdAt })),
    calls: calls.map(c => ({ callId: c.callId, date: c.createdAt, caller: c.analysis?.callerName || c.phoneNumber, summary: c.analysis?.summary, need: c.analysis?.lead?.need, when: c.analysis?.lead?.preferredTime }))
  };
}

/** Offline: best keyword overlap across memories and summaries. */
function keywordAnswer(question, notes) {
  const q = new Set(words(question));
  const scored = [
    ...notes.memories.map(m => ({ text: m.text, who: m.who, callId: m.callId, date: m.date, s: words(`${m.text} ${m.who || ''} ${m.kind}`).filter(w => q.has(w)).length + 0.5 })),
    ...notes.calls.map(c => ({ text: c.summary, who: c.caller, callId: c.callId, date: c.date, s: words(`${c.summary} ${c.caller || ''} ${c.need || ''}`).filter(w => q.has(w)).length }))
  ].filter(x => x.text && x.s >= 1.5).sort((a, b) => b.s - a.s).slice(0, 2);
  if (!scored.length) return { answer: 'I couldn\'t find that in your calls.', found: false, callIds: [] };
  const fmt = d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return { answer: scored.map(x => `${x.text} (${fmt(x.date)})`).join(' Also: '), found: true, callIds: scored.map(x => x.callId).filter(Boolean) };
}

export async function ask(userId, question) {
  const notes = await notesFor(userId);
  if (!notes.memories.length && !notes.calls.length) return { answer: 'I don\'t have any calls to look through yet.', found: false, callIds: [] };
  if (!llmAvailable()) return keywordAnswer(question, notes);
  try {
    const r = await structuredJson({
      effort: 'low',
      purposeModel: 'fast',
      maxTokens: 1200,
      timeoutMs: 15000,
      schema: ANSWER_SCHEMA,
      system: `You answer the owner's question about their past phone calls, using ONLY the notes provided (memories Vexa saved and call summaries).
Reply in one or two short spoken sentences: the answer, who said it and when ("Arjun from CoolFix quoted ₹1,800 for the gas refill on 28 Oct").
If the notes don't contain the answer, say so plainly and set found=false — never guess, never invent amounts, names or dates.
callIds: the callId of every note you used. followUp: usually null; at most one short suggestion for something the OWNER can do ("Call Arjun back to confirm"). Never offer to do things yourself — you cannot set reminders, call or message anyone (promises with a time are reminded automatically).
Today is ${new Date().toISOString()}.`,
      user: JSON.stringify({ question: String(question).slice(0, 300), notes })
    });
    const known = new Set([...notes.memories.map(m => m.callId), ...notes.calls.map(c => c.callId)]);
    return { answer: r.answer, found: !!r.found, callIds: (r.callIds || []).filter(id => known.has(id)), followUp: r.followUp || null };
  } catch (err) {
    console.warn(`Memory ask fell back to keywords: ${err.message}`);
    return keywordAnswer(question, notes);
  }
}

// ── Promise reminders ────────────────────────────────────────────────────────

export async function sendDueReminders(now = new Date()) {
  if (!isMongoConnected()) return 0;
  const due = await Memory.find({ kind: 'promise', status: 'open', remindedAt: null, dueAt: { $ne: null, $lte: now } }).limit(100).lean();
  for (const m of due) {
    await Memory.updateOne({ _id: m._id }, { $set: { remindedAt: now } });
    await notifyUser(m.userId, {
      title: `⏰ ${m.who ? `${m.who} promised` : 'A caller promised'} something`,
      body: `${m.text} — did it happen? Tap to mark it done or follow up.`,
      type: 'promise_due',
      callId: m.callId || ''
    }).catch(() => {});
  }
  return due.length;
}

let timer = null;
export function startReminderLoop(everyMs = 5 * 60 * 1000) {
  if (timer || process.env.NODE_ENV === 'test') return;
  timer = setInterval(() => sendDueReminders().catch(err => console.error('Reminder loop:', err.message)), everyMs);
  timer.unref();
}

export default { saveFromCall, list, update, remove, ask, sendDueReminders, startReminderLoop };
