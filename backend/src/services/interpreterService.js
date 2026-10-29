/**
 * Two-way interpreter: two people, two phones, two languages.
 *
 * The owner opens a room in their language and shares the link / QR (/i/:room).
 * The guest joins in theirs. Every message is translated into the other
 * person's language (Claude fast model), shown with the original, and spoken
 * on the receiving phone. Both phones poll for new messages.
 *
 * Rooms live in memory (lost on restart) for 2 hours, 300 messages at most,
 * and are never saved as calls. Without an AI key the original text is passed
 * through and marked untranslated.
 */

import crypto from 'crypto';
import { structuredJson, llmAvailable } from '../lib/llm.js';
import { strictObject } from '../lib/claude.js';
import { LANGUAGE_CODES, languageName } from '../lib/language.js';
import { newLedger, withLedger, summarize } from '../lib/usage.js';

const ROOM_TTL_MS = 2 * 3600 * 1000;
const MAX_MESSAGES = 300;
const MAX_ROOMS_PER_OWNER = 3;
const rooms = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, r] of rooms) if (now - r.updatedAt > ROOM_TTL_MS) rooms.delete(id);
}, 5 * 60 * 1000).unref();

const err = (status, message) => Object.assign(new Error(message), { status });
const lang = l => (LANGUAGE_CODES.includes(l) ? l : null);

export async function interpret(text, from, to, ledger = null) {
  if (from === to) return { text, translated: true };
  if (!llmAvailable()) return { text, translated: false };
  const run = () => structuredJson({
    effort: 'low',
    purposeModel: 'fast',
    maxTokens: 1200,
    timeoutMs: 12000,
    schema: strictObject({ translation: { type: 'string' } }),
    system: `You are a live interpreter between two people talking face to face or by phone.
Translate the speaker's words from ${languageName(from)} into ${languageName(to)}, as natural spoken ${languageName(to)} in its own script.
Keep it first person, keep the meaning and tone, keep names, numbers, prices, addresses and dates exactly. Do not add, explain or answer anything.
If the text mixes languages (e.g. Hinglish), translate all of it.`,
    user: String(text)
  });
  try {
    const out = ledger ? await withLedger(ledger, 'interpreting', run) : await run();
    return { text: out.translation?.trim() || text, translated: true };
  } catch (e) {
    console.warn(`Interpreter failed (${from}→${to}): ${e.message}`);
    return { text, translated: false };
  }
}

export function create(ownerId, ownerLang, guestLang = null) {
  const owned = [...rooms.values()].filter(r => r.ownerId === ownerId).sort((a, b) => a.updatedAt - b.updatedAt);
  while (owned.length >= MAX_ROOMS_PER_OWNER) rooms.delete(owned.shift().id);
  const id = crypto.randomBytes(9).toString('base64url');
  const room = {
    id, ownerId,
    langs: { owner: lang(ownerLang) || 'en', guest: lang(guestLang) },
    messages: [], seq: 0, createdAt: Date.now(), updatedAt: Date.now(), guestJoined: false,
    ledger: newLedger()
  };
  rooms.set(id, room);
  return view(room, 'owner', 0);
}

function get(id) {
  const r = rooms.get(String(id || ''));
  if (!r) throw err(404, 'This conversation has ended. Ask for a new link.');
  return r;
}

function view(r, side, after = 0) {
  return {
    room: r.id,
    side,
    langs: r.langs,
    guestJoined: r.guestJoined,
    messages: r.messages.filter(m => m.seq > after),
    usage: side === 'owner' ? summarize(r.ledger) : undefined
  };
}

export function join(id, guestLang) {
  const r = get(id);
  if (lang(guestLang)) r.langs.guest = lang(guestLang);
  r.guestJoined = true;
  r.updatedAt = Date.now();
  return view(r, 'guest', 0);
}

export function poll(id, side, after, ownerId = null) {
  const r = get(id);
  if (side === 'owner' && r.ownerId !== ownerId) throw err(404, 'Not your conversation');
  return view(r, side, Number(after) || 0);
}

export async function say(id, side, text, ownerId = null) {
  const r = get(id);
  if (side === 'owner' && r.ownerId !== ownerId) throw err(404, 'Not your conversation');
  if (r.messages.length >= MAX_MESSAGES) throw err(429, 'This conversation is full. Start a new one.');
  const clean = String(text || '').trim().slice(0, 600);
  if (!clean) throw err(400, 'Message is empty');
  const from = r.langs[side] || 'en';
  const other = side === 'owner' ? 'guest' : 'owner';
  const to = r.langs[other] || 'en';
  const out = await interpret(clean, from, to, r.ledger);
  const msg = { seq: ++r.seq, from: side, text: clean, lang: from, translation: out.text, translationLang: to, translated: out.translated, at: new Date().toISOString() };
  r.messages.push(msg);
  r.updatedAt = Date.now();
  return msg;
}

export function setLang(id, side, l, ownerId = null) {
  const r = get(id);
  if (side === 'owner' && r.ownerId !== ownerId) throw err(404, 'Not your conversation');
  if (!lang(l)) throw err(400, 'Unsupported language');
  r.langs[side] = l;
  r.updatedAt = Date.now();
  return view(r, side, r.seq);
}

export function close(id, ownerId) {
  const r = get(id);
  if (r.ownerId !== ownerId) throw err(404, 'Not your conversation');
  rooms.delete(r.id);
  return { closed: true, usage: summarize(r.ledger) };
}

export default { create, join, poll, say, setLang, close, interpret };
