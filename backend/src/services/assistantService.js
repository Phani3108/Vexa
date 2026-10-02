/**
 * "Ask Vexa" — control the receptionist in plain language.
 *
 *   "Tell Dana her parts arrived"              → note delivered next time Dana calls
 *   "Always put Mom straight through"          → caller rule
 *   "Focus until 5pm" / "Focus for 2 hours"    → shield mode with auto-expiry
 *   "Block +1 800 555 0199" / "Block that warranty number"
 *   "Add Alex as VIP +1 512 555 0177"
 *   "Turn off the job applicant flow"
 *   "What did I miss?"                         → daily brief
 *
 * Parsing: model (when configured) → structured actions; otherwise a
 * deterministic grammar. Execution is always the same validated code path.
 */

import Caller from '../models/mongodb/Caller.js';
import Call from '../models/mongodb/Call.js';
import Booking from '../models/mongodb/Booking.js';
import userConfigService from './userConfigService.js';
import { structuredJson, llmAvailable } from '../lib/llm.js';
import { nullableString, strictObject } from '../lib/claude.js';

const nb = { anyOf: [{ type: 'boolean' }, { type: 'null' }] };
const COMMAND_SCHEMA = strictObject({
  actions: {
    type: 'array',
    items: strictObject({
      type: { type: 'string', enum: ['brief', 'shield', 'block', 'unblock', 'vip_add', 'always_transfer', 'note', 'flow_toggle'] },
      mode: { anyOf: [{ type: 'string', enum: ['focus', 'aggressive', 'silent', 'standard'] }, { type: 'null' }] },
      until: nullableString,
      who: nullableString,
      name: nullableString,
      phone: nullableString,
      text: nullableString,
      flow: nullableString,
      once: nb,
      on: nb,
      enabled: nb
    })
  }
});
import { extractPhone } from '../workflows/extractors.js';
import { defaultWorkflows } from '../workflows/templates.js';
import { phonesMatch } from '../lib/phone.js';

const escapeRx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ─────────────────────────────────────────────────────────────────────────────
// Brief
// ─────────────────────────────────────────────────────────────────────────────

export async function dailyBrief(userId) {
  const user = await userConfigService.getUser(userId);
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const base = { userId, isTest: { $ne: true }, createdAt: { $gte: since } };
  const [calls, needsYou, requests] = await Promise.all([
    Call.find(base).sort({ createdAt: -1 }).limit(50).lean(),
    Call.find({ userId, isTest: { $ne: true }, 'followUp.status': 'new' }).sort({ createdAt: -1 }).limit(5).lean(),
    Booking.countDocuments({ userId, status: 'requested' })
  ]);
  const spam = calls.filter(c => c.analysis?.isSpam).length;
  const leads = calls.filter(c => c.analysis?.lead?.isLead).length;
  const urgent = calls.filter(c => ['high', 'critical'].includes(c.analysis?.urgency)).length;
  const seconds = calls.reduce((s, c) => s + (c.duration || 0), 0);
  const minutesSaved = Math.round(seconds / 60 + calls.length);
  const skipped = calls.reduce((s, c) => s + (c.workflowRun?.slotsSkipped || 0), 0);

  const lines = [];
  if (!calls.length) lines.push('Quiet day — no calls in the last 24 hours.');
  else {
    lines.push(`${calls.length} call${calls.length === 1 ? '' : 's'} handled in the last 24 hours, saving you about ${minutesSaved} minutes.`);
    if (leads) lines.push(`${leads} ${user?.accountType === 'personal' ? 'message' : 'lead'}${leads === 1 ? '' : 's'} captured.`);
    if (spam) lines.push(`${spam} spam call${spam === 1 ? '' : 's'} shut down.`);
    if (urgent) lines.push(`${urgent} urgent call${urgent === 1 ? '' : 's'} flagged.`);
  }
  if (needsYou.length) lines.push(`${needsYou.length} waiting on you — start with ${needsYou[0].analysis?.callerName || needsYou[0].analysis?.lead?.name || 'the most recent'}.`);
  if (requests) lines.push(`${requests} booking request${requests === 1 ? '' : 's'} to approve.`);

  return {
    headline: lines[0],
    text: lines.join(' '),
    stats: { calls: calls.length, leads, spam, urgent, minutesSaved, questionsSkipped: skipped, bookingRequests: requests },
    needsYou: needsYou.map(c => ({ callId: c.callId, name: c.analysis?.callerName || c.analysis?.lead?.name || null, from: c.phoneNumber, summary: c.analysis?.summary, at: c.createdAt })),
    shield: userConfigService.effectiveShield(user),
    shieldUntil: user?.shield?.until || null
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────────────────────

/** Owner's local clock: "Current time for the owner (America/Chicago, UTC-05:00): Fri, Oct 2, 10:38 AM" */
function tzOffset(tz, at = new Date()) {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(at).find(p => p.type === 'timeZoneName')?.value || 'GMT';
    const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
  } catch {
    return -at.getTimezoneOffset();
  }
}
function timeContext(tz) {
  const zone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const off = tzOffset(zone);
  const sign = off < 0 ? '-' : '+';
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
  const mm = String(Math.abs(off) % 60).padStart(2, '0');
  const local = new Date().toLocaleString('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `Current time for the owner (${zone}, UTC${sign}${hh}:${mm}): ${local}.`;
}
/** Wall-clock time h:m today (or tomorrow if past) in the owner's timezone → Date */
function atLocal(h, m, tz, now) {
  const off = tzOffset(tz, now);
  const local = new Date(now.getTime() + off * 60000); // UTC fields now read as local wall-clock
  const target = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), h, m) - off * 60000;
  return new Date(target <= now.getTime() ? target + 86400000 : target);
}

function parseDuration(text, now = new Date(), tz = null) {
  const t = text.toLowerCase();
  const rel = t.match(/\bfor\s+(an?|\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)\b/);
  if (rel) {
    const n = rel[1].startsWith('a') ? 1 : Number(rel[1]);
    return new Date(now.getTime() + n * (rel[2].startsWith('h') ? 3600000 : 60000));
  }
  const until = t.match(/\b(?:until|till|til)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (until) {
    let h = Number(until[1]);
    const m = Number(until[2] || 0);
    if (until[3] === 'pm' && h < 12) h += 12;
    if (until[3] === 'am' && h === 12) h = 0;
    if (!until[3] && h < 8) h += 12;
    if (tz) return atLocal(h, m, tz, now);
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return d;
  }
  if (/\b(tonight|end of (the )?day)\b/.test(t)) { const d = new Date(now); d.setHours(23, 59, 0, 0); return d; }
  if (/\btomorrow\b/.test(t)) { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; }
  return null;
}

export function parseOffline(text, now = new Date(), tz = null) {
  const t = text.trim();
  const lower = t.toLowerCase();
  const phone = extractPhone(t)?.value || null;
  let m;

  if (/\b(what did i miss|brief|briefing|recap|summary|how('?s| is| was) (my|the) day|catch me up)\b/.test(lower)) return [{ type: 'brief' }];

  // "Tell X …" is always a message for a caller, even if it mentions a meeting or focus
  if ((m = t.match(/^(?:tell|let)\s+(.+?)\s+(?:know\s+)?(?:that\s+)?((?:her|his|their|the|my|your|we|i|it|they|he|she)\b.+)$/i)) || (m = t.match(/^(?:tell|let)\s+(\S+(?:\s+[A-Z]\S*)?)\s+(.+)$/))) {
    // Speak to the caller directly: "her parts arrived" → "Your parts arrived"
    const msg = m[2].replace(/\s+(next time|when) (they|he|she) calls?\.?$/i, '').replace(/^know\s+(that\s+)?/i, '')
      .replace(/^(her|his|their)\b/i, 'your').replace(/^(she|he|they)('s| is| are)\b/i, "you're").replace(/^(she|he|they) (has|have)\b/i, 'you have');
    return [{ type: 'note', who: m[1], phone, text: msg.charAt(0).toUpperCase() + msg.slice(1), once: !/\b(always|every time)\b/i.test(t) }];
  }

  if ((m = lower.match(/\b(turn|switch)\s+(on|off)\s+(the\s+)?(.+?)\s+(flow|workflow)\b/)) || (m = lower.match(/\b(enable|disable)\s+(the\s+)?(.+?)\s+(flow|workflow)\b/))) {
    const enable = m[1] === 'enable' || m[2] === 'on';
    const name = m[1] === 'enable' || m[1] === 'disable' ? m[3] : m[4];
    return [{ type: 'flow_toggle', flow: name.trim(), enabled: enable }];
  }

  if (/\b(focus|do not disturb|dnd|don'?t disturb|busy mode|meeting|surgery|nobody bother|don'?t bother|no calls)\b/.test(lower)) {
    if (/\b(off|stop|end|disable|cancel)\b/.test(lower)) return [{ type: 'shield', mode: 'standard' }];
    return [{ type: 'shield', mode: 'focus', until: parseDuration(t, now, tz)?.toISOString() || null }];
  }
  if (/\b(aggressive|strict|block all spam|spam shield)\b/.test(lower)) return [{ type: 'shield', mode: /\boff\b/.test(lower) ? 'standard' : 'aggressive', until: parseDuration(t, now, tz)?.toISOString() || null }];
  if (/\bsilent\b/.test(lower)) return [{ type: 'shield', mode: /\boff\b/.test(lower) ? 'standard' : 'silent', until: parseDuration(t, now, tz)?.toISOString() || null }];
  if (/\b(standard|normal) mode\b|\bshield off\b/.test(lower)) return [{ type: 'shield', mode: 'standard' }];

  if ((m = t.match(/^unblock\s+(.+)$/i))) return [{ type: 'unblock', who: m[1], phone }];
  if ((m = t.match(/^block\s+(.+)$/i))) return [{ type: 'block', who: m[1], phone }];

  if ((m = t.match(/^add\s+(.+?)\s+(?:as\s+)?(?:a\s+)?vip\b/i)) || (m = t.match(/^(?:make|mark)\s+(.+?)\s+(?:a\s+)?vip\b/i))) {
    return [{ type: 'vip_add', name: m[1].replace(/\+?[\d\s()-]{10,}/, '').trim(), phone }];
  }

  if ((m = t.match(/\b(?:always\s+)?(?:put|transfer|connect|send)\s+(.+?)\s+(?:straight\s+)?(?:through|to me)\b/i)) || (m = t.match(/\bwhen\s+(.+?)\s+calls?,?\s+(?:put|transfer|connect)\b/i))) {
    const off = /\b(stop|don'?t|never|no longer)\b/i.test(t);
    return [{ type: 'always_transfer', who: m[1].replace(/^(stop|don'?t|never)\s+/i, ''), phone, on: !off }];
  }

  return [];
}

async function parseWithModel(text, tz) {
  if (!llmAvailable()) return null;
  try {
    const parsed = await structuredJson({
      effort: 'low',
      maxTokens: 2048,
      timeoutMs: 10000,
      schema: COMMAND_SCHEMA,
      system: `Convert the owner's instruction for their AI phone receptionist into actions. ${timeContext(tz)}
Action types:
- brief: the owner wants a recap of recent calls.
- shield: change call-screening mode. "focus" = do not disturb: the owner is busy (meeting, surgery, driving, sleeping, "don't bother me") — nobody is put through except emergencies. "silent" = calls handled as normal but no notifications. "aggressive" = spam shield. "standard" = back to normal. "until" is an ISO 8601 time WITH the owner's UTC offset, or null.
- block / unblock: a caller by name ("who") or number ("phone", E.164).
- vip_add: add "name" with "phone" (E.164) as a VIP.
- always_transfer: "who"/"phone"; "on" false to stop.
- note: a message to deliver to caller "who" next time they call. Write "text" addressed to the caller (second person), e.g. "Your parts arrived". "once" false if it should repeat every call.
- flow_toggle: turn the flow named "flow" on or off via "enabled".
Fill unused fields with null. If nothing matches, return an empty actions array.`,
      user: text
    });
    return Array.isArray(parsed.actions)
      ? parsed.actions.map(a => Object.fromEntries(Object.entries(a).filter(([, v]) => v !== null)))
      : null;
  } catch (err) {
    console.warn(`Ask Vexa model parse failed, using rules: ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution
// ─────────────────────────────────────────────────────────────────────────────

async function resolvePerson(userId, user, who, phone) {
  if (phone) {
    const caller = await Caller.findOne({ userId, phoneNumber: phone }).lean();
    return { phoneNumber: phone, name: caller?.callerName || who };
  }
  const name = String(who || '').replace(/^(the|my)\s+/i, '').trim();
  if (!name) return null;
  const vip = (user.vipContacts || []).find(v => v.name?.toLowerCase() === name.toLowerCase());
  if (vip) return { phoneNumber: vip.phoneNumber, name: vip.name };
  const rx = new RegExp(`^${escapeRx(name)}\\b`, 'i');
  const callers = await Caller.find({ userId, callerName: rx }).sort({ lastCallAt: -1 }).limit(3).lean();
  if (callers.length) return { phoneNumber: callers[0].phoneNumber, name: callers[0].callerName, ambiguous: callers.length > 1 };
  // Someone who has called (including test calls) but has no saved profile yet
  const byCall = await Call.findOne({ userId, 'analysis.callerName': rx }).sort({ createdAt: -1 }).lean();
  if (byCall) return { phoneNumber: byCall.phoneNumber, name: byCall.analysis.callerName };
  // "that warranty number" → most recent caller whose summary matches
  const words = name.split(/\s+/).filter(w => w.length > 3 && !/^(that|number|caller|guy|lady|person)$/i.test(w));
  if (words.length) {
    const call = await Call.findOne({ userId, isTest: { $ne: true }, 'analysis.summary': new RegExp(words.map(escapeRx).join('|'), 'i') }).sort({ createdAt: -1 }).lean();
    if (call) return { phoneNumber: call.phoneNumber, name: call.analysis?.callerName || call.phoneNumber };
  }
  return null;
}

function fmtTime(iso, tz) {
  try {
    return new Date(iso).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', weekday: 'short', timeZone: tz || undefined });
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export async function runCommand(userId, text) {
  const user = await userConfigService.getUser(userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  const modelActions = await parseWithModel(text, user.businessProfile?.timezone);
  const actions = modelActions?.length ? modelActions : parseOffline(text, new Date(), user.businessProfile?.timezone);
  if (!actions.length) {
    return {
      reply: 'I can block numbers, pass messages to callers, put people straight through, switch Focus or Spam shield, add VIPs, toggle flows, or catch you up. Try “Tell Dana her parts arrived”.',
      done: [],
      understood: false
    };
  }

  const tz = user.businessProfile?.timezone;
  const done = [];
  const replies = [];
  let brief = null;

  for (const a of actions.slice(0, 5)) {
    switch (a.type) {
      case 'brief':
        brief = await dailyBrief(userId);
        replies.push(brief.text);
        done.push({ type: 'brief' });
        break;

      case 'shield': {
        const mode = ['focus', 'aggressive', 'silent', 'standard'].includes(a.mode) ? a.mode : 'standard';
        let until = a.until && !isNaN(new Date(a.until)) ? new Date(a.until) : null;
        // "until 7 pm today" said at 10 pm means the next 7 pm — never a time already passed
        while (until && until <= new Date()) until = new Date(until.getTime() + 86400000);
        await userConfigService.updateUser(userId, { shield: { mode, until } });
        const label = { focus: 'Focus is on', aggressive: 'Spam shield is on', silent: 'Silent mode is on', standard: 'Back to standard mode' }[mode];
        replies.push(`${label}${until && mode !== 'standard' ? ` until ${fmtTime(until, tz)}` : ''}.${mode === 'focus' ? ' I’ll handle every call and only break through for emergencies.' : ''}`);
        done.push({ type: 'shield', mode, until });
        break;
      }

      case 'block':
      case 'unblock': {
        const person = await resolvePerson(userId, user, a.who, a.phone);
        if (!person) { replies.push(`I couldn’t find “${a.who}”. Try their number.`); break; }
        if (a.type === 'block') {
          if (!userConfigService.isBlocked(user, person.phoneNumber)) await userConfigService.addBlockedNumber(userId, person.phoneNumber).catch(() => {});
          replies.push(`Blocked ${person.name !== person.phoneNumber ? `${person.name} (${person.phoneNumber})` : person.phoneNumber}. Their calls will be rejected before I answer.`);
        } else {
          await userConfigService.removeBlockedNumber(userId, person.phoneNumber);
          replies.push(`Unblocked ${person.name}.`);
        }
        done.push({ type: a.type, phoneNumber: person.phoneNumber });
        break;
      }

      case 'vip_add': {
        if (!a.phone) { replies.push(`What’s ${a.name}’s number? Say “Add ${a.name} as VIP +1 555 123 4567”.`); break; }
        const vips = (user.vipContacts || []).filter(v => !phonesMatch(v.phoneNumber, a.phone));
        await userConfigService.updateUser(userId, { vipContacts: [...vips, { name: a.name, phoneNumber: a.phone, relationship: '', notes: '' }] });
        replies.push(`${a.name} is now a VIP — warm greeting and an offer to put them through.`);
        done.push({ type: 'vip_add', name: a.name, phoneNumber: a.phone });
        break;
      }

      case 'always_transfer': {
        const person = await resolvePerson(userId, user, a.who, a.phone);
        if (!person) { replies.push(`I don’t know “${a.who}” yet. Once they’ve called (or you add them as a VIP) I can do that.`); break; }
        await Caller.findOneAndUpdate({ userId, phoneNumber: person.phoneNumber }, { $set: { alwaysTransfer: a.on !== false, ...(person.name ? { callerName: person.name } : {}) } }, { upsert: true });
        replies.push(a.on !== false ? `Done — when ${person.name} calls, I’ll put them straight through (except in Focus).` : `Okay, ${person.name} will be screened like everyone else.`);
        done.push({ type: 'always_transfer', phoneNumber: person.phoneNumber, on: a.on !== false });
        break;
      }

      case 'note': {
        const person = await resolvePerson(userId, user, a.who, a.phone);
        if (!person) { replies.push(`I don’t have a number for “${a.who}” yet. Add their number: “Tell ${a.who} +1 555… ${a.text}”.`); break; }
        await Caller.findOneAndUpdate(
          { userId, phoneNumber: person.phoneNumber },
          { $push: { instructions: { text: String(a.text).slice(0, 300), once: a.once !== false, createdAt: new Date() } }, $setOnInsert: { callerName: person.name } },
          { upsert: true }
        );
        replies.push(`Got it. Next time ${person.name} calls, I’ll tell them: “${a.text}”.${person.ambiguous ? ' (I matched the most recent caller with that name.)' : ''}`);
        done.push({ type: 'note', phoneNumber: person.phoneNumber, text: a.text });
        break;
      }

      case 'flow_toggle': {
        const flows = user.workflows?.length ? user.workflows : defaultWorkflows(user.accountType);
        const q = String(a.flow || '').toLowerCase().replace(/\b(the|flow|workflow)\b/g, '').trim();
        const flow = flows.find(f => f.name.toLowerCase().includes(q) || f.id.toLowerCase().includes(q.replace(/\s+/g, '_')));
        if (!flow) { replies.push(`I couldn’t find a flow called “${a.flow}”.`); break; }
        if (flow.trigger?.isDefault && a.enabled === false) { replies.push('The fallback flow has to stay on so every call has somewhere to go.'); break; }
        flow.enabled = a.enabled !== false;
        await userConfigService.updateUser(userId, { workflows: flows });
        replies.push(`${flow.name} flow is now ${flow.enabled ? 'on' : 'off'}.`);
        done.push({ type: 'flow_toggle', id: flow.id, enabled: flow.enabled });
        break;
      }

      default:
        break;
    }
  }

  return { reply: replies.join(' ') || 'Done.', done, understood: true, ...(brief ? { brief } : {}), parsedBy: modelActions?.length ? 'ai' : 'rules' };
}
