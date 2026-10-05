/**
 * Call session lifecycle shared by real phone calls (VoiceAgent) and
 * in-app test calls (simulator):
 *
 *   openCallSession()  → context, risk score, flow engine, greeting
 *   takeTurn()         → model understanding (optional) + engine step
 *   whisper()          → owner steers the live call
 *   finalizeCallSession() → analysis + save + outcomes (leads, bookings, SMS)
 */

import { WorkflowSession } from './engine.js';
import { understand, nluAvailable } from './nlu.js';
import { structuredJson, llmAvailable } from '../lib/llm.js';
import { strictObject } from '../lib/claude.js';
import { scoreRisk } from './risk.js';
import { applyOutcomes, leadFromRun } from './outcomes.js';
import ConversationAnalyzer from '../voice/ConversationAnalyzer.js';
import PromptGenerator from '../voice/PromptGenerator.js';
import callHistoryService from '../services/callHistoryService.js';
import userConfigService from '../services/userConfigService.js';
import pushService from '../services/pushNotificationService.js';
import Call from '../models/mongodb/Call.js';
import Caller from '../models/mongodb/Caller.js';
import { findByPhone } from '../lib/phone.js';
import { extractEmail } from './extractors.js';
import { newLedger, withLedger, summarize } from '../lib/usage.js';
import { translateText, translateLines } from '../lib/translate.js';
import { detectLanguage, normalizeLanguage } from '../lib/language.js';

export async function openCallSession({ user, callerNumber, isTest = false, io = null, callId = null }) {
  const callerCtx = await callHistoryService.getCallerContext(callerNumber, user.userId);
  const vipContact = findByPhone(user.vipContacts, callerNumber);
  const priorityTimeInfo = userConfigService.isInPriorityTime(user, callerNumber);
  const businessHours = user.accountType !== 'personal' ? userConfigService.businessHoursStatus(user) : null;
  const risk = scoreRisk({ callerNumber, callerCtx, user });
  const shield = userConfigService.effectiveShield(user);

  const onAction = (action) => {
    // Urgent alerts can't wait for the call to end
    if (action.type === 'notify_owner' && action.params?.urgent) {
      io?.to(`user:${user.userId}`).emit('call:urgent', { callId, slots: action.slots, workflow: action.workflow });
      if (!isTest) {
        pushService.sendUrgentCallNotification(user.userId, {
          callId,
          callerName: action.slots?.name || callerCtx?.callerName || 'Caller',
          callerNumber,
          reason: action.slots?.problem || 'Emergency call'
        }).catch(() => {});
      }
    }
  };

  const engine = new WorkflowSession({
    user: { ...user, shield: { ...(user.shield || {}), mode: shield } },
    callerCtx,
    callerNumber,
    vipContact,
    priorityTimeInfo,
    businessHours,
    risk,
    onAction
  });

  // Trusted contacts are greeted by the name you saved for them
  const baseGreeting = vipContact && !user.aiSettings?.greeting
    ? `Hi ${vipContact.name}! This is ${(user.name || 'the owner').split(' ')[0]}'s assistant.`
    : PromptGenerator.generateInitialGreeting(user, callerCtx);
  const greeting = engine.greeting(baseGreeting);
  const ledger = newLedger();

  // Recording notice (live calls are recorded unless the owner turned it off)
  const recording = !isTest && user.recording?.enabled !== false;
  if (recording && user.recording?.announce !== false) greeting.say = `${greeting.say} This call may be recorded.`;

  // Opening language = the owner's default; switches as soon as the caller speaks another one
  const language = normalizeLanguage(user.aiSettings?.language) || 'en';
  greeting.sayEn = greeting.say;
  if (language !== 'en') greeting.say = await withLedger(ledger, 'translation', () => translateText(greeting.say, language));
  greeting.language = language;

  const session = { engine, callerCtx, vipContact, priorityTimeInfo, businessHours, risk, shield, greeting, whispers: [], ledger, io, callId, user, callerNumber, isTest, language, languages: new Set([language]), recording };

  // A trusted contact calling while you're in Focus: your app asks whether to pick up
  if (vipContact && priorityTimeInfo?.inPriorityTime) {
    emitHandoff(session, {
      kind: 'vip',
      title: `${vipContact.name} is calling`,
      detail: `You're in Focus${engine.availableAt() ? ` (${engine.availableAt().replace(/^after /, 'until ')})` : ''}. Vexa will tell them when you're free unless you pick up.`
    });
  }
  return session;
}

/** Ask the owner's app to pick up (or let Vexa handle) — shown as a full-screen prompt. */
function emitHandoff(session, { kind, title, detail }) {
  const slots = session.engine.publicSlots();
  session.io?.to(`user:${session.user.userId}`).emit('call:handoff', {
    callId: session.callId,
    kind,
    title,
    detail,
    callerName: slots.name?.value || session.vipContact?.name || (session.callerCtx?.callerName !== 'Unknown' ? session.callerCtx?.callerName : null) || (slots.company?.value ? `${slots.company.value} courier` : null),
    callerNumber: session.callerNumber,
    facts: Object.values(slots).map(x => `${x.label}: ${x.value}`),
    isTest: !!session.isTest,
    at: new Date().toISOString()
  });
}

/**
 * Directions for a courier, written by the model from ONLY the owner's notes
 * and the courier's stated location. Falls back to the template on any failure.
 */
async function groundedDirections(session, fallback) {
  const a = session.user.deliveryAddress || {};
  const location = session.engine.slots.location?.value;
  if (!llmAvailable() || !location) return fallback;
  try {
    const out = await withLedger(session.ledger, 'directions', () => structuredJson({
      effort: 'low',
      purposeModel: 'fast',
      maxTokens: 1500,
      timeoutMs: 6000,
      schema: strictObject({ directions: { type: 'string' } }),
      system: `You give a delivery rider short spoken directions (2-3 sentences) to the owner's home.
Use ONLY the facts provided: the address, the landmark and the owner's notes. Do not invent roads, turns, distances, times or landmarks that are not in them.
Acknowledge where the rider says they are. Always say the full address once. Plain speech, no lists.`,
      user: JSON.stringify({
        riderSays: location,
        address: session.engine.formatHomeAddress(),
        landmark: a.landmark || null,
        ownerNotes: a.societyNotes || null
      })
    }));
    return out.directions?.trim() || fallback;
  } catch (err) {
    console.warn('Directions generation fell back to template:', err.message);
    return fallback;
  }
}

/** One caller utterance → what the receptionist says next. */
/**
 * @param opts.translate        false on live phone calls: the realtime voice speaks the English
 *                              line in the caller's language itself (no extra request, lower latency)
 * @param opts.translateTimeout per-turn translation budget (test calls can wait longer)
 */
export async function takeTurn(session, text, { nluTimeout, translate = true, translateTimeout = 8000 } = {}) {
  const e = session.engine;
  // Answer to an owner-requested question ("ask for their email")
  if (e.asked === '__email') {
    const em = extractEmail(text) || { value: text.trim(), display: text.trim() };
    e.slots.email = { ...em, source: 'answer' };
    e.asked = null;
    e.log('slots', { filled: ['email'], values: { email: em.display } });
    return { ...e.result(e.run({ say: ['Got it, thank you.'] })), aiAssisted: false };
  }
  const nlu = await withLedger(session.ledger, 'understanding', () => understand(e, text, { timeout: nluTimeout }));
  const result = session.engine.turn(text, nlu);

  if (result.generate?.kind === 'directions') {
    const parts = result.parts.slice();
    parts[result.generate.index] = await groundedDirections(session, result.generate.fallback);
    result.parts = parts;
    result.say = parts.join(' ').replace(/\s{2,}/g, ' ').trim();
  }
  if (result.transfer) {
    const slots = e.publicSlots();
    emitHandoff(session, {
      kind: 'transfer',
      title: `${slots.company?.value ? `${slots.company.value} delivery` : slots.name?.value || 'Caller'} needs you`,
      detail: e.active?.id === 'p_delivery' ? 'The courier needs your OTP. Pick up to talk to them now.' : 'Vexa is transferring this call to you.'
    });
  }
  // Multilingual edge: reply in the language the caller just used (they may switch any time)
  const heardLang = nlu?.language || detectLanguage(text);
  if (normalizeLanguage(heardLang)) session.language = heardLang;
  session.languages.add(session.language);
  result.sayEn = result.say;
  if (translate && session.language !== 'en' && result.say) {
    result.say = await withLedger(session.ledger, 'translation', () => translateText(result.say, session.language, { timeoutMs: translateTimeout }));
  }
  result.language = session.language;
  result.heard = { language: heardLang, translation: nlu?.translation || (heardLang === 'en' ? text : null) };
  return { ...result, aiAssisted: !!nlu };
}

/** Translate an English line into the caller's current language (used for whispers). */
async function localize(session, text) {
  if (!text || session.language === 'en') return text;
  return withLedger(session.ledger, 'translation', () => translateText(text, session.language));
}

/**
 * Owner steering a live call. Quick actions map to engine outcomes;
 * free text is relayed to the caller in the receptionist's voice.
 */
export async function whisper(session, payload) {
  const r = whisperEn(session, payload);
  r.sayEn = r.say;
  r.say = await localize(session, r.say);
  r.language = session.language;
  return r;
}

function whisperEn(session, { text, action }) {
  const e = session.engine;
  const entry = { text: text || action, at: new Date() };
  session.whispers.push(entry);
  e.log('whisper', { text: entry.text });

  if (action === 'transfer') return e.result(e.finish({ say: [] }, 'transfer', 'Good news — I can put you through right now. Transferring you now.'));
  if (action === 'end') {
    if (Object.keys(e.slots).length) e.queueAction({ type: 'create_lead', params: { kind: 'partial' } });
    return e.result(e.finish({ say: [] }, 'end', 'Thanks so much for calling — we will be in touch. I\'m disconnecting the call now.'));
  }
  if (action === 'ask_email') {
    const out = { say: ['One more thing — what is the best email for you?'] };
    e.asked = '__email';
    return e.result(out);
  }
  const msg = String(text || '').trim().replace(/[.\s]+$/, '');
  const relayed = /^(tell|say|let)\b/i.test(msg)
    ? msg.replace(/^(tell (them|him|her)|say|let (them|him|her) know)( that)?\s*/i, '')
    : msg;
  // Relay, then pick the conversation back up where it was
  const pending = e.asked && !e.asked.startsWith('confirm:') && e.slotDef(e.asked);
  const resume = pending ? ` ${e.render(pending.prompt)}` : '';
  return { say: `${e.ownerFirst} just sent me a note for you: ${relayed}.${resume}`, end: false, transfer: false, asked: e.asked, workflow: e.active ? { id: e.active.id, name: e.active.name } : null, slots: e.publicSlots(), progress: e.progress() };
}

function summaryFromRun(run) {
  const s = run.slots || {};
  const who = s.name || 'Caller';
  const what = s.need || s.service || s.issue || s.problem || s.reason || s.details || s.company || s.role;
  const when = s.timing || s.when || s.newTime || s.callbackTime;
  if (run.workflowId === 'sales_shutdown' || run.workflowId === 'p_spam') return 'Sales / spam call — declined and ended quickly.';
  return `${who} — ${run.workflowName}${what ? `: ${what}` : ''}${when ? ` (${when})` : ''}.`;
}

/**
 * Save the call with flow results and apply outcomes.
 * @param {object} callResult { callId, userId, from, direction, status, duration, startTime, endTime, transcripts, takenOver, isTest }
 */
export async function finalizeCallSession({ session, user, callResult, io = null }) {
  const run = session.engine.record();

  // Bilingual transcript: every line keeps what was said + English
  const lines = callResult.transcripts || [];
  for (const l of lines) {
    if (!l.lang) l.lang = l.speaker === 'system' ? 'en' : detectLanguage(l.text);
    if (l.lang === 'en' && !l.textEn) l.textEn = l.text;
  }
  const missing = lines.filter(l => !l.textEn && l.text);
  if (missing.length) {
    const en = await withLedger(session.ledger, 'translation', () => translateLines(missing.map(l => ({ text: l.text, lang: l.lang })), 'en'));
    missing.forEach((l, i) => { l.textEn = en[i]; });
  }
  const callerLangs = lines.filter(l => l.speaker === 'user' || l.speaker === 'caller').map(l => l.lang).filter(x => x && x !== 'en');
  const callLanguage = callerLangs.length
    ? [...new Set(callerLangs)].sort((a, b) => callerLangs.filter(x => x === b).length - callerLangs.filter(x => x === a).length || callerLangs.lastIndexOf(b) - callerLangs.lastIndexOf(a))[0]
    : null;

  const analyzer = new ConversationAnalyzer(process.env);
  const englishView = lines.map(l => ({ ...l, text: l.textEn || l.text }));
  const analysis = await withLedger(session.ledger, 'post-call analysis', () => analyzer.analyze(englishView, { categories: user.callCategories || [], accountType: user.accountType }));

  // The flow's collected facts are authoritative; the analyzer fills gaps.
  const lead = leadFromRun(run, callResult.from);
  const spam = run.actions.some(a => a.type === 'tag_spam');
  if (run.workflowId) {
    if (analysis.fallback || !analysis.summary) analysis.summary = summaryFromRun(run);
    if (analysis.categoryId === 'personal.unknown' || analysis.fallback) analysis.categoryLabel = run.workflowName;
    if (lead.isLead) analysis.lead = { ...(analysis.lead || {}), ...Object.fromEntries(Object.entries(lead).filter(([, v]) => v != null)) };
    else if (analysis.lead) analysis.lead.isLead = false;
    if (lead.name) analysis.callerName = lead.name;
    analysis.isSpam = spam || (analysis.isSpam && !lead.isLead);
    analysis.actionRequired = lead.isLead || !!analysis.actionRequired;
    if (/emergency/.test(run.workflowId)) analysis.urgency = 'critical';
    if (analysis.isSpam) { analysis.actionRequired = false; if (analysis.lead) analysis.lead.isLead = false; }
  }

  // Summary in the caller's language too, so the owner can read it either way
  if (callLanguage && analysis.summary) {
    analysis.summaryLocal = { lang: callLanguage, text: await withLedger(session.ledger, 'translation', () => translateText(analysis.summary, callLanguage, { timeoutMs: 20000 })) };
  }
  const languages = [...new Set(['en', ...lines.map(l => l.lang).filter(Boolean)])];

  const saved = await callHistoryService.saveCall({ ...callResult, transcripts: lines, languages, workflowRun: run, whispers: session.whispers, aiUsage: summarize(session.ledger) }, analysis);
  if (!saved) return null;

  const results = await applyOutcomes({ run, call: saved, user, io });
  await Call.updateOne({ _id: saved._id }, { $set: { 'workflowRun.actions': results } });

  if (!callResult.isTest && callResult.from) {
    const $inc = {};
    if (analysis.isSpam) $inc.spamCount = 1;
    if ((callResult.duration || 0) < 15 && !lead.isLead) $inc.shortCalls = 1;
    const update = Object.keys($inc).length ? { $inc } : {};
    // One-time notes were delivered in the greeting — remove them
    if (session.engine.deliveredNotes?.length) update.$pull = { instructions: { once: true } };
    if (Object.keys(update).length) await Caller.updateOne({ userId: user.userId, phoneNumber: callResult.from }, update);
  }

  const final = await Call.findById(saved._id).lean();
  io?.to(`user:${user.userId}`).emit('call:analyzed', {
    callId: final.callId,
    summary: final.analysis?.summary,
    categoryLabel: final.analysis?.categoryLabel,
    isLead: !!final.analysis?.lead?.isLead,
    followUp: final.followUp?.status
  });
  return final;
}

export { nluAvailable };
