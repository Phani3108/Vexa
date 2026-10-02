/**
 * Test calls — "Call your receptionist" from the app.
 *
 * Runs the exact same flow engine (and model understanding, when an OpenAI
 * key is configured) as real phone calls, over text. Finished test calls are
 * saved with isTest: true so they never skew stats or caller memory.
 */

import crypto from 'crypto';
import userConfigService from './userConfigService.js';
import { openCallSession, takeTurn, whisper as whisperTurn, finalizeCallSession, nluAvailable } from '../workflows/callSession.js';
import { isValidE164 } from '../lib/phone.js';

const SESSION_TTL_MS = 30 * 60 * 1000;
const sessions = new Map();

setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, s] of sessions) if (s.updatedAt < cutoff) sessions.delete(id);
}, 60 * 1000).unref();

let ioRef = null;
export function attachIO(io) { ioRef = io; }

function view(s, r, extra = {}) {
  return {
    reply: r.say,
    replyEn: r.sayEn || r.say,
    language: r.language || 'en',
    heard: r.heard || null,
    ended: !!r.end,
    transferred: !!r.transfer,
    asked: r.asked || null,
    workflow: r.workflow || null,
    slots: r.slots || {},
    progress: r.progress ?? 0,
    mode: s.mode,
    ...extra
  };
}

export async function startSession(userId, { callerNumber, flowId } = {}) {
  const user = await userConfigService.getUser(userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  const mine = [...sessions.values()].filter(s => s.userId === userId);
  if (mine.length >= 5) mine.sort((a, b) => a.updatedAt - b.updatedAt).slice(0, mine.length - 4).forEach(s => sessions.delete(s.id));

  // Each test call gets its own fictional 555 number so caller memory from one
  // test never leaks into the next (pass callerNumber to test "returning caller").
  const from = isValidE164(callerNumber) ? callerNumber : `+1555555${String(crypto.randomInt(0, 10000)).padStart(4, '0')}`;
  const id = crypto.randomUUID();
  const call = await openCallSession({ user, callerNumber: from, isTest: true, io: ioRef, callId: `test_${id}` });
  // "Test this flow" — start directly inside a specific flow
  const forced = flowId && call.engine.flows.find(f => f.id === flowId);
  if (forced && !call.greeting.end) call.engine.activate(forced, 'test');
  const s = {
    id, userId, user, from, call,
    mode: nluAvailable() ? 'ai' : 'offline',
    transcripts: [{ speaker: 'assistant', text: call.greeting.say, textEn: call.greeting.sayEn, lang: call.greeting.language, timestamp: new Date().toISOString() }],
    startedAt: new Date(),
    updatedAt: Date.now(),
    ended: false
  };
  sessions.set(id, s);

  const res = {
    sessionId: id,
    greeting: call.greeting.say,
    greetingEn: call.greeting.sayEn,
    language: call.greeting.language,
    mode: s.mode,
    risk: call.risk,
    caller: {
      number: from,
      name: call.vipContact?.name || (call.callerCtx?.callerName !== 'Unknown' ? call.callerCtx?.callerName : null) || null,
      isVIP: !!call.vipContact,
      totalCalls: call.callerCtx?.totalCalls || 0
    },
    shield: call.shield,
    inFocus: !!call.priorityTimeInfo?.inPriorityTime,
    businessOpen: call.businessHours ? call.businessHours.open : null,
    workflow: call.engine.active ? { id: call.engine.active.id, name: call.engine.active.name } : null
  };
  if (call.greeting.end) {
    const saved = await finish(s, !!call.greeting.transfer);
    return { ...res, ended: true, transferred: !!call.greeting.transfer, call: saved };
  }
  return res;
}

function getOwned(userId, sessionId) {
  const s = sessions.get(sessionId);
  if (!s || s.userId !== userId) throw Object.assign(new Error('Test call not found or expired'), { status: 404 });
  return s;
}

export async function sendMessage(userId, sessionId, text) {
  const s = getOwned(userId, sessionId);
  if (s.ended) throw Object.assign(new Error('This test call has ended'), { status: 409 });
  const clean = String(text || '').trim().slice(0, 1000);
  if (!clean) throw Object.assign(new Error('Message is empty'), { status: 400 });

  const callerLine = { speaker: 'user', text: clean, timestamp: new Date().toISOString() };
  s.transcripts.push(callerLine);
  s.updatedAt = Date.now();
  const t0 = Date.now();
  // Test calls can wait a little longer for the model than a live phone line can
  const r = await takeTurn(s.call, clean, { nluTimeout: Number(process.env.TEST_NLU_TIMEOUT_MS) || 12000, translateTimeout: 20000 });
  if (r.heard?.language) callerLine.lang = r.heard.language;
  if (r.heard?.translation) callerLine.textEn = r.heard.translation;
  s.transcripts.push({ speaker: 'assistant', text: r.say, textEn: r.sayEn, lang: r.language, timestamp: new Date().toISOString() });

  const latencyMs = Date.now() - t0;
  // The caller hears the goodbye immediately; analysis + outcomes run in the background
  // and the app picks the saved call up by id (GET /api/calls/:callId).
  if (r.end) finish(s, r.transfer).catch(err => console.error('Test call finalize failed:', err.message));
  return view(s, r, { latencyMs, aiAssisted: r.aiAssisted, ...(r.end ? { callId: `test_${s.id}`, pending: true } : {}) });
}

export async function whisper(userId, sessionId, payload) {
  const s = getOwned(userId, sessionId);
  if (s.ended) throw Object.assign(new Error('This test call has ended'), { status: 409 });
  const r = await whisperTurn(s.call, payload || {});
  s.transcripts.push({ speaker: 'system', text: `Owner: ${payload?.text || payload?.action}`, lang: 'en', timestamp: new Date().toISOString() });
  if (r.say) s.transcripts.push({ speaker: 'assistant', text: r.say, textEn: r.sayEn, lang: r.language, timestamp: new Date().toISOString() });
  if (r.end) finish(s, r.transfer).catch(err => console.error('Test call finalize failed:', err.message));
  return view(s, r, r.end ? { callId: `test_${s.id}`, pending: true } : {});
}

export async function endSession(userId, sessionId) {
  const s = getOwned(userId, sessionId);
  if (s.ended) return { call: s.saved || null };
  return { call: await finish(s, false) };
}

async function finish(s, transferred) {
  s.ended = true;
  const final = await finalizeCallSession({
    session: s.call,
    user: s.user,
    io: ioRef,
    callResult: {
      callId: `test_${s.id}`,
      userId: s.userId,
      from: s.from,
      direction: 'incoming',
      status: 'completed',
      duration: Math.round((Date.now() - s.startedAt.getTime()) / 1000),
      startTime: s.startedAt,
      endTime: new Date(),
      transcripts: s.transcripts,
      takenOver: !!transferred,
      isTest: true
    }
  });
  s.saved = final ? {
    callId: final.callId,
    analysis: final.analysis,
    followUp: final.followUp,
    workflowRun: final.workflowRun
  } : null;
  sessions.delete(s.id);
  return s.saved;
}

export default { startSession, sendMessage, whisper, endSession, attachIO };
