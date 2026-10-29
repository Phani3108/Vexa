/**
 * Vexa Link — a public page (and QR code) where anyone can talk to an
 * account's receptionist from their phone's browser, by voice or text.
 *
 * Same flow engine and understanding as phone calls. Visitors are anonymous:
 * no caller memory, no recording, records are never read out (no verified
 * number). Conversations are saved as real calls with channel 'link'.
 *
 * Cost guard: each account sets a daily conversation limit (default 50); each
 * conversation is capped at MAX_MESSAGES; the routes rate-limit per visitor IP.
 */

import crypto from 'crypto';
import UserConfig from '../models/mongodb/UserConfig.js';
import Call from '../models/mongodb/Call.js';
import userConfigService from './userConfigService.js';
import pushService from './pushNotificationService.js';
import { openCallSession, takeTurn, finalizeCallSession } from '../workflows/callSession.js';
import { upiLink, isUpiId } from '../lib/upi.js';

const SESSION_TTL_MS = 20 * 60 * 1000;
const MAX_MESSAGES = 40;
const SLUG_RX = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const RESERVED = new Set(['api', 'admin', 'login', 'app', 'vexa', 'help', 'support', 'static', 'assets', 'www', 'link', 'new']);

const sessions = new Map();
let ioRef = null;
export function attachIO(io) { ioRef = io; }

setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, s] of sessions) if (s.updatedAt < cutoff) finish(s).catch(() => {});
}, 60 * 1000).unref();

const err = (status, message) => Object.assign(new Error(message), { status });

export function validSlug(slug) {
  return typeof slug === 'string' && SLUG_RX.test(slug) && !RESERVED.has(slug);
}

/** "Sri Lakshmi Kirana & Hardware" → "sri-lakshmi-kirana-hardware" */
export function suggestSlug(name) {
  const base = String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  return base.length >= 3 && !RESERVED.has(base) ? base : `vexa-${crypto.randomInt(10000, 99999)}`;
}

async function ownerBySlug(slug) {
  if (!validSlug(slug)) throw err(404, 'This link does not exist');
  const user = await UserConfig.findOne({ 'link.slug': slug, 'link.enabled': true }).lean();
  if (!user) throw err(404, 'This link is not active');
  return user;
}

/** What the public page may show: nothing private. */
export async function publicInfo(slug) {
  const user = await ownerBySlug(slug);
  const p = user.businessProfile || {};
  const biz = user.accountType !== 'personal';
  const hours = biz && p.hours?.length ? userConfigService.businessHoursStatus(user) : null;
  return {
    name: biz ? (p.businessName || user.name) : `${(user.name || 'the owner').split(' ')[0]}'s assistant`,
    description: biz ? (p.description || '') : 'Leave a message or ask a question.',
    accountType: user.accountType,
    language: user.aiSettings?.language || 'en',
    open: hours ? hours.open : null,
    nextOpen: hours && !hours.open ? hours.nextOpen || null : null
  };
}

async function usedToday(userId) {
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const saved = await Call.countDocuments({ userId, channel: 'link', createdAt: { $gte: since } });
  const live = [...sessions.values()].filter(s => s.userId === userId).length;
  return saved + live;
}

export async function start(slug) {
  const owner = await ownerBySlug(slug);
  const limit = owner.link?.dailyLimit || 50;
  if (await usedToday(owner.userId) >= limit) throw err(429, 'This assistant is very busy today. Please call or try again tomorrow.');
  const user = await userConfigService.getUser(owner.userId);
  const id = crypto.randomUUID();
  const callId = `link_${id}`;
  const call = await openCallSession({ user, callerNumber: null, io: ioRef, callId, channel: 'link' });
  const s = {
    id, slug, userId: user.userId, user, call, callId,
    transcripts: [{ speaker: 'assistant', text: call.greeting.say, textEn: call.greeting.sayEn, lang: call.greeting.language, timestamp: new Date().toISOString() }],
    startedAt: new Date(), updatedAt: Date.now(), messages: 0, ended: false
  };
  sessions.set(id, s);
  ioRef?.to(`user:${user.userId}`).emit('call:started', { callId, from: 'Vexa Link', callerName: 'Web visitor', timestamp: s.startedAt.toISOString(), isVIP: false, channel: 'link' });
  return { sessionId: id, greeting: call.greeting.say, language: call.greeting.language };
}

function owned(slug, id) {
  const s = sessions.get(id);
  if (!s || s.slug !== slug) throw err(404, 'This conversation has ended. Start a new one.');
  return s;
}

export async function message(slug, id, text) {
  const s = owned(slug, id);
  if (s.ended) throw err(409, 'This conversation has ended');
  const clean = String(text || '').trim().slice(0, 500);
  if (!clean) throw err(400, 'Message is empty');
  if (++s.messages > MAX_MESSAGES) {
    await finish(s);
    return { reply: 'Thanks for chatting! The team will follow up if needed.', ended: true };
  }
  s.updatedAt = Date.now();
  const line = { speaker: 'user', text: clean, timestamp: new Date().toISOString() };
  s.transcripts.push(line);
  ioRef?.to(`user:${s.userId}`).emit('call:transcript', { callId: s.callId, speaker: 'user', text: clean, timestamp: line.timestamp });
  const r = await takeTurn(s.call, clean, { nluTimeout: Number(process.env.TEST_NLU_TIMEOUT_MS) || 12000, translateTimeout: 20000 });
  if (r.heard?.language) line.lang = r.heard.language;
  if (r.heard?.translation) line.textEn = r.heard.translation;
  const at = new Date().toISOString();
  s.transcripts.push({ speaker: 'assistant', text: r.say, textEn: r.sayEn, lang: r.language, timestamp: at });
  ioRef?.to(`user:${s.userId}`).emit('call:transcript', { callId: s.callId, speaker: 'assistant', text: r.say, lang: r.language, textEn: r.sayEn, timestamp: at });
  if (r.end) finish(s, r.transfer).catch(e => console.error('Link finalize failed:', e.message));
  // A "transfer" on the web means: the owner is alerted and calls back
  const reply = r.transfer ? `${r.say.replace(/\s*Transferring you now\.?$/i, '')} The team has been alerted and will call you back.`.trim() : r.say;
  return { reply, language: r.language || 'en', ended: !!r.end, ...(r.end ? { pay: payButton(s) } : {}) };
}

/** An order that ended with a payment link: show it on the page (opens GPay, PhonePe…), within the owner's auto limit. */
function payButton(s) {
  const action = s.call.engine.actions.find(a => a.type === 'pay_link');
  const p = s.user.businessProfile || {};
  const amount = Math.round(Number(action?.params?.amount) * 100) / 100;
  if (!action || !isUpiId(p.upiId) || !(amount > 0) || amount > Number(p.payLinkAutoLimit ?? 5000)) return null;
  const biz = p.businessName || s.user.name || 'us';
  return { amount, url: upiLink({ pa: p.upiId, pn: p.upiName || biz, am: amount, tn: `Order from ${biz}`.slice(0, 80) }) };
}

export async function end(slug, id) {
  const s = sessions.get(id);
  if (s && s.slug === slug && !s.ended) await finish(s);
  return { ended: true };
}

async function finish(s, transferred = false) {
  if (s.ended) return null;
  s.ended = true;
  sessions.delete(s.id);
  if (s.messages === 0) {
    ioRef?.to(`user:${s.userId}`).emit('call:ended', { callId: s.callId });
    return null;   // opened and left without a word: nothing to save
  }
  const final = await finalizeCallSession({
    session: s.call,
    user: s.user,
    io: ioRef,
    callResult: {
      callId: s.callId, userId: s.userId, from: null, direction: 'incoming', status: 'completed',
      duration: Math.round((Date.now() - s.startedAt.getTime()) / 1000),
      startTime: s.startedAt, endTime: new Date(), transcripts: s.transcripts, takenOver: !!transferred, isTest: false
    }
  });
  ioRef?.to(`user:${s.userId}`).emit('call:ended', { callId: s.callId });
  if (final && !final.analysis?.isSpam) {
    pushService.sendCallSummaryNotification(s.userId, { callId: final.callId, callerName: final.analysis?.callerName || 'Vexa Link visitor', summary: final.analysis?.summary }).catch(() => {});
  }
  return final;
}

// ── Owner settings ───────────────────────────────────────────────────────────

export async function getSettings(userId) {
  const user = await userConfigService.getUser(userId);
  if (!user) throw err(404, 'User not found');
  const name = user.accountType !== 'personal' ? user.businessProfile?.businessName || user.name : user.name;
  return {
    enabled: !!user.link?.enabled,
    slug: user.link?.slug || null,
    suggestedSlug: user.link?.slug || suggestSlug(name),
    dailyLimit: user.link?.dailyLimit || 50,
    usedToday: await usedToday(userId)
  };
}

export async function updateSettings(userId, { enabled, slug, dailyLimit }) {
  const user = await userConfigService.getUser(userId);
  if (!user) throw err(404, 'User not found');
  const $set = {};
  if (slug !== undefined) {
    const s = String(slug).toLowerCase().trim();
    if (!validSlug(s)) throw err(400, 'Use 3–40 lowercase letters, numbers or dashes');
    const taken = await UserConfig.exists({ 'link.slug': s, userId: { $ne: userId } });
    if (taken) throw err(409, 'That link name is taken');
    $set['link.slug'] = s;
  }
  if (enabled !== undefined) {
    if (enabled && !user.link?.slug && !$set['link.slug']) {
      let s = suggestSlug(user.businessProfile?.businessName || user.name);
      if (await UserConfig.exists({ 'link.slug': s })) s = `${s.slice(0, 33)}-${crypto.randomInt(100, 999)}`;
      $set['link.slug'] = s;
    }
    $set['link.enabled'] = !!enabled;
  }
  if (dailyLimit !== undefined) {
    const n = Math.round(Number(dailyLimit));
    if (!(n >= 1 && n <= 1000)) throw err(400, 'Daily limit must be between 1 and 1000');
    $set['link.dailyLimit'] = n;
  }
  if (Object.keys($set).length) await UserConfig.updateOne({ userId }, { $set });
  return getSettings(userId);
}

export default { start, message, end, publicInfo, getSettings, updateSettings, attachIO, validSlug, suggestSlug };
