/**
 * Demo v3 timeline: build-v3/run.json → voices (macOS `say`), scene layout,
 * mixed audio (build-v3/audio/mix.wav), subtitles (build-v3/vexa-demo-v3.srt)
 * and build-v3/timeline.json for the player.
 *
 *   node demo/v3-timeline.mjs
 *
 * Same helpers as build-timeline.mjs (v2), kept separate so the v2 film still rebuilds exactly.
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(here, 'build-v3');
const AUDIO = path.join(BUILD, 'audio');
fs.rmSync(AUDIO, { recursive: true, force: true });
fs.mkdirSync(AUDIO, { recursive: true });
const run = JSON.parse(fs.readFileSync(path.join(BUILD, 'run.json'), 'utf8'));
const S = Object.fromEntries(run.scenarios.map(s => [s.id, s]));

const RATE = 22050;
const VOICES = { vexa: { voice: 'Samantha', rate: 182 }, narrator: { voice: 'Daniel', rate: 178 }, owner: { voice: 'Rishi', rate: 172 } };
const VEXA_BY_LANG = { en: VOICES.vexa, hi: { voice: 'Lekha', rate: 172 }, mr: { voice: 'Lekha', rate: 168 }, te: { voice: 'Geeta', rate: 172 }, ta: { voice: 'Vani', rate: 172 }, ml: null, gu: null };
const LANG_NAME = { en: 'English', hi: 'Hindi', te: 'Telugu', ta: 'Tamil', ml: 'Malayalam', mr: 'Marathi', gu: 'Gujarati', es: 'Spanish' };
const callerVoice = (sc, lang = 'en') => {
  if (typeof sc.callerVoice === 'string') return { voice: sc.callerVoice, rate: 172 };
  const v = sc.callerVoice?.[lang] ?? sc.callerVoice?.en;
  return v ? { voice: v, rate: 170 } : null;
};

// ── Audio helpers ────────────────────────────────────────────────────────────
const speakable = text => String(text)
  .replace(/\*\*/g, '')
  .replace(/upi:\/\/\S+/g, 'a UPI link')
  .replace(/₹\s?([\d,]+(\.\d+)?)/g, (_, n) => `${n.replace(/,/g, '')} rupees`)
  .replace(/\b(\d{1,2})(am|pm)\b/gi, (_, h, ap) => `${h} ${ap.toLowerCase() === 'am' ? 'A M' : 'P M'}`)
  .replace(/—/g, ', ').replace(/\s+/g, ' ').trim();
const display = text => String(text).replace(/\bU P I\b/g, 'UPI').replace(/\bO T P\b/g, 'OTP').replace(/\bA P I\b/g, 'API');

let clipNo = 0;
function synth(text, cfg) {
  if (!cfg) {
    const duration = Math.max(2.4, Math.min(9, text.length / 13));
    return { file: null, samples: new Int16Array(Math.round(duration * RATE)), duration, silent: true };
  }
  const id = String(++clipNo).padStart(3, '0');
  const aiff = path.join(AUDIO, `${id}.aiff`), wav = path.join(AUDIO, `${id}.wav`);
  execFileSync('say', ['-v', cfg.voice, '-r', String(cfg.rate), '-o', aiff, speakable(text)]);
  execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${RATE}`, '-c', '1', aiff, wav]);
  const pcm = readPcm(wav);
  return { file: wav, samples: pcm, duration: pcm.length / RATE };
}
function readPcm(wav) {
  const buf = fs.readFileSync(wav);
  let off = 12;
  while (off < buf.length) {
    const id = buf.toString('ascii', off, off + 4), size = buf.readUInt32LE(off + 4);
    if (id === 'data') { const n = Math.floor(size / 2), out = new Int16Array(n); for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(off + 8 + i * 2); return out; }
    off += 8 + size + (size % 2);
  }
  throw new Error(`no data chunk in ${wav}`);
}
function envelope(samples) {
  const step = Math.floor(RATE / 30), env = [];
  for (let i = 0; i < samples.length; i += step) {
    let s = 0; const end = Math.min(samples.length, i + step);
    for (let j = i; j < end; j++) s += samples[j] * samples[j];
    env.push(Math.round(Math.min(1, Math.sqrt(s / Math.max(1, end - i)) / 9000) * 100) / 100);
  }
  return env;
}
function chunks(text, start, duration) {
  const words = String(text).split(/\s+/), groups = [];
  let cur = [];
  for (const w of words) { cur.push(w); if (cur.length >= 16 || (cur.length >= 8 && /[.?!;:]$/.test(w))) { groups.push(cur.join(' ')); cur = []; } }
  if (cur.length) groups.push(cur.join(' '));
  const total = groups.reduce((s, g) => s + g.length, 0);
  let t = start;
  return groups.map(g => { const d = duration * (g.length / total); const c = { text: g, start: t, end: t + d }; t += d; return c; });
}

// ── Timeline primitives ──────────────────────────────────────────────────────
// The model that actually handled each turn, read from the recorded usage
const turnModel = run.scenarios.flatMap(s => s.call?.aiUsage?.detail || []).find(u => u.purpose === 'understanding')?.model || 'Claude';
const analysisModel = run.scenarios.flatMap(s => s.call?.aiUsage?.detail || []).find(u => u.purpose === 'post-call analysis')?.model || 'Claude';
const timeline = { fps: 12, width: 1920, height: 1080, segments: [], subtitles: [], clips: [], badge: `Real Claude run · ${turnModel} per turn · local server` };
let clock = 0;
const addClip = (clip, start) => { if (clip.file) timeline.clips.push({ file: clip.file, start, duration: clip.duration }); };

function voiced(text, cfg, speaker, sub = null, gap = 0.35) {
  const clip = synth(text, cfg);
  addClip(clip, clock);
  const line = { text: display(text), start: clock, end: clock + clip.duration, env: envelope(clip.samples), speaker };
  timeline.subtitles.push(...chunks(display(sub || text), clock, clip.duration).map(c => ({ ...c, speaker: speaker === 'narrator' ? 'Narrator' : speaker })));
  clock += clip.duration + gap;
  return line;
}
const narrate = (lines, gap = 0.45) => lines.map(t => voiced(t, VOICES.narrator, 'narrator', null, gap));

function titleCard({ kicker, title, subtitle, lines, hold = 0.8 }) {
  const start = clock; clock += 0.6;
  const narration = narrate(lines); clock += hold;
  timeline.segments.push({ type: 'title', start, end: clock, kicker, title, subtitle, narration });
}
function screen({ image, caption, kicker, lines = [], hold = 1.2 }) {
  const start = clock; clock += 0.5;
  const narration = narrate(lines); clock += hold;
  timeline.segments.push({ type: 'screen', start, end: clock, image, caption, kicker, narration, taps: [] });
}
function table({ kicker, title, subtitle, columns, rows, note, lines, hold = 2.5, highlight = [] }) {
  const start = clock; clock += 0.6;
  const narration = narrate(lines); clock += hold;
  timeline.segments.push({ type: 'table', start, end: clock, kicker, title, subtitle, columns, rows, note, highlight, narration });
}
function duo({ images, labels, kicker, caption, bullets, lines = [], dialogue = [], hold = 1.5 }) {
  const start = clock; clock += 0.5;
  const narration = narrate(lines);
  for (const d of dialogue) narration.push(voiced(d.text, d.voice, d.speaker, d.en, 0.45));
  clock += hold;
  timeline.segments.push({ type: 'duo', start, end: clock, images, labels, kicker, caption, bullets, narration });
}
function terminal({ kicker, title, subtitle, entries, lines, hold = 2 }) {
  const start = clock; clock += 0.6;
  const narration = narrate(lines);
  const span = Math.max(4, clock - start - 0.6);
  const timed = entries.map((e, i) => ({ ...e, at: start + 0.8 + (span * i) / Math.max(1, entries.length) }));
  clock += hold;
  timeline.segments.push({ type: 'terminal', start, end: clock, kicker, title, subtitle, entries: timed, narration });
}

function callSegment(sc, { brief = false } = {}) {
  const start = clock; clock += 0.8;
  const lines = [];
  const understanding = (sc.call?.aiUsage?.detail || []).filter(u => u.purpose === 'understanding');
  let ui = 0, spent = 0, tokens = 0;
  const push = (speaker, text, cfg, meta = {}) => {
    const clip = synth(text, cfg);
    addClip(clip, clock);
    lines.push({ speaker, text, start: clock, end: clock + clip.duration, env: envelope(clip.samples), silent: !!clip.silent, ...meta });
    const foreign = meta.lang && meta.lang !== 'en';
    const label = (speaker === 'ai' ? 'Vexa' : sc.callerName) + (foreign ? ` · ${LANG_NAME[meta.lang] || meta.lang}` : '');
    timeline.subtitles.push(...chunks(foreign && meta.en ? meta.en : text, clock, clip.duration).map(c => ({ ...c, speaker: label, translated: foreign })));
    clock += clip.duration;
  };
  for (const t of sc.turns) {
    if (t.speaker === 'caller') { push('caller', t.text, callerVoice(sc, t.lang || 'en'), { lang: t.lang || 'en', en: t.en }); clock += 0.25; continue; }
    const thinkStart = clock;
    let turnCost = 0, turnTokens = 0;
    if (t.latencyMs) {
      clock += 1.1;
      const u = understanding[ui++];
      if (u) { turnCost = u.costUsd || 0; turnTokens = (u.inputTokens || 0) + (u.outputTokens || 0); }
    }
    spent += turnCost; tokens += turnTokens;
    const lang = t.lang || 'en';
    push('ai', t.text, lang in VEXA_BY_LANG ? VEXA_BY_LANG[lang] : VOICES.vexa, { lang, en: t.en, style: t.style, thinkStart, latencyMs: t.latencyMs || null, aiAssisted: t.aiAssisted, understanding: t.understanding, turnCost, turnTokens, spent, tokens });
    clock += 0.35;
  }
  const outcomeStart = clock + 0.4;
  clock = outcomeStart;
  const outcomeNarration = brief ? [] : narrate([`Call summary: ${sc.call.summary}`], 0.4);
  clock += brief ? 3 : 2.2;
  timeline.segments.push({
    type: 'call', start, end: clock,
    scenario: { id: sc.id, title: sc.title, subtitle: sc.subtitle, callerName: sc.callerName, risk: sc.risk, languages: sc.call.languages, summaryLocal: sc.call.summaryLocal },
    lines, outcome: { start: outcomeStart, ...sc.call, totalCost: sc.call.aiUsage.costUsd, totalTokens: sc.call.aiUsage.inputTokens + sc.call.aiUsage.outputTokens },
    outcomeNarration
  });
}

// ── The film ─────────────────────────────────────────────────────────────────
titleCard({
  kicker: 'Demo v3', title: 'Vexa — beyond the phone line',
  subtitle: 'Business packs · Vexa Link and QR · UPI payments · scam shield and family guardian · memory · interpreter · AI agents',
  lines: [
    'This is Vexa, version three. Since the last demo, Vexa learned the trades of seven kinds of Indian businesses, left the phone line, and started protecting families.',
    'Everything you will see ran live on a local Vexa server with real Claude calls and real costs. Customers and screens are real app pages, driven automatically; the voices are synthesized for this recording.'
  ]
});

// Packs
screen({ image: 'packs.png', kicker: 'Business packs', caption: 'Seven ready-made receptionists for Indian businesses',
  lines: ['Business packs. Clinic, salon, restaurant, kirana, home services, coaching and real estate: each pack brings its own call flows, a sample business, and rules about what Vexa must never do.'] });
screen({ image: 'pack-sheet.png', kicker: 'Install a pack', caption: 'Flows, refusal rules, and a sample business to try at once',
  lines: ['Phani runs Sri Lakshmi Kirana and Hardware in Kondapur. One tap installs the kirana pack, with a sample catalog to try it right away.'] });
screen({ image: 'flows-kirana.png', kicker: 'Flows', caption: 'Home delivery orders, order status — plus every built-in flow',
  lines: ['Now his receptionist takes home delivery orders and tells customers where their order is.'] });

// Vexa Link
screen({ image: 'link-qr.png', kicker: 'Vexa Link', caption: 'Your receptionist on a QR code — no phone number, no app',
  lines: ['Vexa Link. Dr. Rao’s clinic turns it on and gets a link and a QR code for the counter, the door, or WhatsApp. Customers talk to the receptionist from their own phone browser, by voice or text, in eight languages. No phone number and no app needed.'] });
screen({ image: '3-link-open.png', kicker: 'On the customer’s phone', caption: 'Scan → talk. The page says it is an AI assistant',
  lines: ['A customer scans the QR code. This is what opens on her phone.'] });
titleCard({ kicker: 'Vexa Link · Tamil', title: S['3'].title, subtitle: S['3'].subtitle,
  lines: ['She asks in Tamil about a thyroid test: does she need to fast, and what does it cost. Then she asks which tablet to take for a fever.'] });
callSegment(S['3']);
screen({ image: 'link-clinic-chat.png', kicker: 'Customer’s phone', caption: 'Price and fasting rule from the clinic’s own list — and no medical advice',
  lines: ['The price and the fasting rule come from the clinic’s own list. And the clinic pack never gives medical advice: it offers a doctor’s appointment instead.'] });

// Restaurant
titleCard({ kicker: 'Restaurant', title: S['4'].title, subtitle: S['4'].subtitle,
  lines: ['A restaurant. A customer orders in Hindi, with everything in one sentence. Vexa reads the order back with an exact total before placing it.'] });
callSegment(S['4']);

// Kirana on the Link + UPI
titleCard({ kicker: 'Vexa Link · UPI', title: S['5'].title, subtitle: S['5'].subtitle,
  lines: ['Back to Phani’s kirana. A customer opens his Vexa Link and orders in Hindi for home delivery.'] });
callSegment(S['5']);
screen({ image: 'link-kirana-pay.png', kicker: 'Customer’s phone', caption: `Pay ₹${S['5'].pay?.amount?.toLocaleString('en-IN') || ''} with any UPI app — one tap opens GPay or PhonePe`,
  lines: ['The order ends with a pay button for the exact total. On the customer’s phone, one tap opens GPay, PhonePe or any U P I app. No payment gateway; the money goes straight to the shop’s U P I I D.'] });

// Scam + family
titleCard({ kicker: 'Scam shield + family', title: S['6'].title, subtitle: S['6'].subtitle,
  lines: [
    'Phani’s mother, Lakshmi Amma, uses Vexa too. She linked her son as her guardian with a one time code, and chose what he can see.',
    'Now a caller says he is from the Mumbai police, that there is a case in her name, and that she must join a video call or be arrested. This is the digital arrest scam.'
  ] });
callSegment(S['6']);
duo({ images: ['scam-amma.png', 'scam-guardian.png'], labels: ['Amma’s phone', 'Phani’s phone (guardian)'], kicker: 'Blocked in one turn',
  caption: 'Nothing shared. Amma sees the evidence and the 1930 helpline; her son is alerted at the same moment',
  lines: ['Vexa shares nothing and ends the call in one turn. Amma’s phone shows the evidence, and the 1930 cyber crime helpline. Her son’s phone gets the alert at the same moment, with the caller’s own words. This one was a test call, and it is marked as one.'] });

// Memory
titleCard({ kicker: 'Memory', title: S['7'].title, subtitle: S['7'].subtitle,
  lines: ['A supplier calls Phani’s shop about the air conditioner: a price, and a visit on Monday.'] });
callSegment(S['7']);
screen({ image: 'home-promises.png', kicker: 'Promises & quotes', caption: 'Quotes, promises and facts from calls — with a reminder when a promise falls due',
  lines: ['Vexa remembers the quote and the promise. When Monday 11 A M passes, Phani gets a reminder asking whether Arjun came.'] });
screen({ image: 'ask-memory.png', kicker: 'Ask Vexa', caption: `“${run.commands[0]?.text}” → ${run.commands[0]?.reply}`,
  lines: [`Days later, Phani just asks: what did the AC guy quote? Vexa answers from its notes, and only from its notes. Asked about a fridge quote, it says: ${run.commands[1]?.reply.split('.')[0]}.`] });

// Interpreter
const im = run.interpreter?.messages || [];
duo({ images: ['interp-owner.png', 'interp-guest.png'], labels: ['Phani — speaks Telugu', 'Tenant — speaks Hindi'], kicker: 'Interpreter',
  caption: 'Two phones, two languages — names, numbers and dates kept exactly',
  bullets: [`Interpreting cost for this conversation: $${(run.interpreter?.usage?.costUsd || 0).toFixed(4)}`],
  lines: ['The interpreter. Phani speaks Telugu; his new tenant speaks Hindi. Each speaks on their own phone, and hears the other in their own language.'],
  dialogue: im.flatMap(m => [
    { text: m.text, voice: m.from === 'owner' ? { voice: 'Geeta', rate: 172 } : { voice: 'Rishi', rate: 170 }, speaker: m.from === 'owner' ? 'Phani · Telugu' : 'Tenant · Hindi', en: m.en },
    { text: m.translation, voice: m.translationLang === 'hi' ? { voice: 'Lekha', rate: 172 } : { voice: 'Geeta', rate: 172 }, speaker: `Vexa → ${LANG_NAME[m.translationLang]}`, en: m.en }
  ]) });

// Agent to agent
const ag = run.agent;
const agCost = ag ? (ag.usage.input * 4 + ag.usage.output * 20) / 1e6 : 0;
terminal({ kicker: 'Agent to agent', title: 'A customer’s AI assistant orders from the shop', subtitle: `Claude acting for Priya · uses ${ag?.manifestName}'s published tools · no voice call`,
  entries: [{ kind: 'muted', text: `Task: ${ag?.task}` }, ...(ag?.log || []).map(l => ({ kind: l.kind, text: l.kind === 'result' ? l.text.slice(0, 260) : l.text.replace(/\*\*/g, '') }))],
  lines: [
    'More and more customers will send their own AI assistant instead of calling. Here, Claude acts for a customer named Priya. It reads the shop’s published tools, checks the catalog, places the order, and gets back the exact total and a U P I link.',
    'Milk is out of stock, so the assistant leaves it out and says so. The order is only a request: it waits in Phani’s inbox for him to confirm.'
  ], hold: 3 });
screen({ image: 'activity-agent.png', kicker: 'Activity', caption: 'The agent’s order, the Link order and the supplier’s message — tagged by where they came from',
  lines: ['In Activity, the agent’s order sits next to the Vexa Link order and the supplier’s message, each tagged by where it came from.'] });

// Owner controls
screen({ image: 'usage.png', kicker: 'AI usage', caption: 'A daily AI budget per account — over it, Vexa keeps answering on offline rules',
  lines: ['Every account has a daily AI budget. Phani can see what each kind of conversation cost today. Over the limit, Vexa keeps answering on its offline rules, so no customer is ever cut off.'] });
screen({ image: 'import.png', kicker: 'Import', caption: 'Bring your catalog, order list or listings from CSV or a Google Sheet',
  lines: ['Owners bring their own catalog, order list or property listings, from a file or a Google Sheet, with a preview before anything changes.'] });
screen({ image: 'me-data.png', kicker: 'Your data', caption: 'Download everything, or delete the account and all its data',
  lines: ['And it is their data: download everything, or delete the account, including recordings, in one step.'] });

// Guardrails and evals
const f = run.figures || {};
table({
  kicker: 'Guardrails and evals', title: 'Checked on every change', subtitle: 'Release gates in CI — a change that fails any of these cannot ship',
  columns: ['Gate', 'What it checks', 'Result'],
  rows: [
    ['Pack + scam eval', '45 scripted calls across 7 packs; 26 scam scripts and look-alike genuine calls', `${f.packEval} · precision ${f.scamPrecision} · recall ${f.scamRecall} · ${f.leaks} leaks`],
    ['Understanding eval', '161 caller sentences in 8 languages + 50 held back', `${f.nluOffline} · held-out ${f.nluHoldout} (offline)`],
    ['Unit tests', 'Flows, packs, orders, records, memory, budget, import, security', `${f.tests} passing`],
    ['Dependency audit', 'High and critical advisories in production dependencies', '0 high · 0 critical'],
    ['Refusal rules', 'No medical advice, allergen promises, fixed quotes, guaranteed marks, discriminatory filters', 'Enforced per pack']
  ],
  highlight: [0],
  lines: ['None of this is trusted on looks. Every change runs a pack and scam evaluation of seventy one scripted calls, with zero leaks allowed, an understanding test in eight languages, and the unit tests. If any of them fails, the change cannot ship.']
});

// Costs
const rows = run.scenarios.map(s => [s.title, `${s.call.aiUsage.requests}`, `${(s.call.aiUsage.inputTokens + s.call.aiUsage.outputTokens).toLocaleString('en-US')}`, `$${s.call.aiUsage.costUsd.toFixed(4)}`]);
if (run.interpreter?.usage) rows.push(['Interpreter (3 messages)', `${run.interpreter.usage.requests}`, `${(run.interpreter.usage.inputTokens + run.interpreter.usage.outputTokens).toLocaleString('en-US')}`, `$${(run.interpreter.usage.costUsd || 0).toFixed(4)}`]);
if (ag) rows.push(['Customer’s own assistant (paid by the customer)', '—', `${(ag.usage.input + ag.usage.output).toLocaleString('en-US')}`, `$${agCost.toFixed(4)}`]);
const vexaTotal = run.scenarios.reduce((a, s) => a + s.call.aiUsage.costUsd, 0) + (run.interpreter?.usage?.costUsd || 0);
table({
  kicker: 'The bill', title: 'What each conversation cost', subtitle: `Each turn on ${turnModel} · post-call analysis on ${analysisModel} · measured per request`,
  columns: ['Conversation', 'Requests', 'Tokens', 'Cost'],
  rows: [...rows, ['Total paid by the businesses', '', '', `$${vexaTotal.toFixed(4)}`]],
  highlight: [rows.length],
  note: 'Measured from Claude usage on every request. Phone-line and voice costs are not included; this recording used local synthesized voices.',
  lines: [`What it cost: these ${run.scenarios.length} conversations plus the interpreter came to about ${(vexaTotal * 100).toFixed(0)} cents for the businesses, roughly ${(vexaTotal / run.scenarios.length * 100).toFixed(1)} cents per conversation. The customer’s own assistant is paid by the customer.`]
});

// What's next
table({
  kicker: 'What’s next', title: 'From the web to the phone line', subtitle: 'Wave 1 is built; these need accounts and real phones',
  columns: ['Next', 'What it unlocks', 'Status'],
  rows: [
    ['Hosting (Render + Atlas, Mumbai)', 'Vexa Link and the app on the internet', 'Blueprint and checks ready'],
    ['Indian numbers (Exotel)', 'Real phone calls answered by Vexa', 'Needs KYC'],
    ['Android call screener', 'Contacts ring, unknown callers go to Vexa', 'Planned'],
    ['Calls on your behalf', 'Book, cancel, dispute — within your limits', 'Wave 2'],
    ['Agent-to-agent commerce, your own voice, on-device mode', 'The 10-year bets', 'Designed for']
  ],
  highlight: [0],
  lines: [
    'Next: put it on the internet, then real Indian phone numbers, an Android call screener, and calls Vexa makes for you.',
    'Vexa: every call and every chat answered, in your customer’s language. Families protected. And you are only interrupted when it matters.'
  ], hold: 3
});

timeline.duration = clock;

// ── Mix + subtitles ─────────────────────────────────────────────────────────
const mix = new Int16Array(Math.ceil(clock * RATE) + RATE);
for (const c of timeline.clips) {
  const pcm = readPcm(c.file), at = Math.round(c.start * RATE);
  for (let i = 0; i < pcm.length; i++) mix[at + i] = Math.max(-32768, Math.min(32767, mix[at + i] + pcm[i]));
}
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + mix.length * 2, 4); header.write('WAVE', 8);
header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
header.write('data', 36); header.writeUInt32LE(mix.length * 2, 40);
fs.writeFileSync(path.join(AUDIO, 'mix.wav'), Buffer.concat([header, Buffer.from(mix.buffer)]));

const ts = s => { const ms = Math.round(s * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
fs.writeFileSync(path.join(BUILD, 'vexa-demo-v3.srt'), timeline.subtitles.sort((a, b) => a.start - b.start).map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.speaker}: ${c.text}\n`).join('\n'));
timeline.clips = timeline.clips.map(c => ({ start: c.start, duration: c.duration }));
fs.writeFileSync(path.join(BUILD, 'timeline.json'), JSON.stringify(timeline));
console.log(`Timeline v3: ${clock.toFixed(1)}s (${(clock / 60).toFixed(1)} min), ${timeline.segments.length} segments, ${timeline.subtitles.length} subtitle cues, businesses' AI cost $${vexaTotal.toFixed(4)}`);
