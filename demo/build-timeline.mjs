/**
 * Builds the video timeline from build/run.json:
 *   - synthesizes every line with macOS `say` (one voice per speaker)
 *   - measures durations, computes an audio envelope for the waveform
 *   - lays out title cards, app screens and calls on one clock
 *   - mixes all clips into build/audio/mix.wav and writes subtitles (SRT)
 *
 *   node demo/build-timeline.mjs
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(here, 'build');
const AUDIO = path.join(BUILD, 'audio');
fs.mkdirSync(AUDIO, { recursive: true });
const run = JSON.parse(fs.readFileSync(path.join(BUILD, 'run.json'), 'utf8'));

const RATE = 22050;
const VOICES = {
  vexa: { voice: 'Samantha', rate: 182 },
  narrator: { voice: 'Daniel', rate: 178 },
  owner: { voice: 'Rishi', rate: 172 }
};
// Vexa speaks the caller's language. macOS has no Malayalam or Gujarati voice: those lines are shown, not spoken.
const VEXA_BY_LANG = { en: VOICES.vexa, hi: { voice: 'Lekha', rate: 172 }, mr: { voice: 'Lekha', rate: 168 }, te: { voice: 'Geeta', rate: 172 }, ta: { voice: 'Vani', rate: 172 }, es: { voice: 'Mónica', rate: 178 }, ml: null, gu: null };
const LANG_NAME = { en: 'English', hi: 'Hindi', te: 'Telugu', ta: 'Tamil', ml: 'Malayalam', mr: 'Marathi', gu: 'Gujarati', es: 'Spanish' };
function callerVoice(sc, lang = 'en') {
  if (typeof sc.callerVoice === 'string') return { voice: sc.callerVoice, rate: 172 };
  const v = sc.callerVoice?.[lang] ?? sc.callerVoice?.en;
  return v ? { voice: v, rate: 170 } : null;
}

// ── Speech helpers ──────────────────────────────────────────────────────────
function speakable(text) {
  return text
    .replace(/₹\s?([\d,]+(\.\d+)?)/g, (_, n) => `${n.replace(/,/g, '')} rupees`)
    .replace(/(\d+)mm\b/g, '$1 millimetre')
    .replace(/\b(\d{1,2})(am|pm)\b/gi, (_, h, ap) => `${h} ${ap.toLowerCase() === 'am' ? 'A M' : 'P M'}`)
    .replace(/\bMANUU\b/g, 'Manoo')
    .replace(/—/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Spelled out for the voice, written normally on screen
const display = (text) => text.replace(/\bU P I\b/g, 'UPI').replace(/\bO T P\b/g, 'OTP').replace(/\b(\d{1,2}) P M\b/g, '$1 PM').replace(/\b(\d{1,2}) A M\b/g, '$1 AM');

let clipNo = 0;
function synth(text, cfg) {
  if (!cfg) {
    // No local voice for this language: hold the line on screen for a reading-speed duration
    const duration = Math.max(2.4, Math.min(9, text.length / 13));
    return { file: null, samples: new Int16Array(Math.round(duration * RATE)), duration, silent: true };
  }
  const { voice, rate } = cfg;
  const id = String(++clipNo).padStart(3, '0');
  const aiff = path.join(AUDIO, `${id}.aiff`);
  const wav = path.join(AUDIO, `${id}.wav`);
  execFileSync('say', ['-v', voice, '-r', String(rate), '-o', aiff, speakable(text)]);
  execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${RATE}`, '-c', '1', aiff, wav]);
  const pcm = readPcm(wav);
  return { file: wav, samples: pcm, duration: pcm.length / RATE };
}

function readPcm(wav) {
  const buf = fs.readFileSync(wav);
  let off = 12;
  while (off < buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'data') {
      const n = Math.floor(size / 2);
      const out = new Int16Array(n);
      for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(off + 8 + i * 2);
      return out;
    }
    off += 8 + size + (size % 2);
  }
  throw new Error(`no data chunk in ${wav}`);
}

/** RMS envelope at 30 points/second (for the waveform) */
function envelope(samples) {
  const step = Math.floor(RATE / 30);
  const env = [];
  for (let i = 0; i < samples.length; i += step) {
    let s = 0;
    const end = Math.min(samples.length, i + step);
    for (let j = i; j < end; j++) s += samples[j] * samples[j];
    env.push(Math.min(1, Math.sqrt(s / Math.max(1, end - i)) / 9000));
  }
  return env.map(v => Math.round(v * 100) / 100);
}

/** Subtitle chunks: ≤ ~16 words, timed by character share of the clip */
function chunks(text, start, duration) {
  const words = text.split(/\s+/);
  const groups = [];
  let cur = [];
  for (const w of words) {
    cur.push(w);
    if ((cur.length >= 16) || (cur.length >= 8 && /[.?!;:]$/.test(w))) { groups.push(cur.join(' ')); cur = []; }
  }
  if (cur.length) groups.push(cur.join(' '));
  const total = groups.reduce((s, g) => s + g.length, 0);
  let t = start;
  return groups.map(g => {
    const d = duration * (g.length / total);
    const c = { text: g, start: t, end: t + d };
    t += d;
    return c;
  });
}

// ── Timeline assembly ───────────────────────────────────────────────────────
const timeline = { fps: 12, width: 1920, height: 1080, segments: [], subtitles: [], clips: [] };
let clock = 0;

function addClip(clip, start) {
  if (clip.file) timeline.clips.push({ file: clip.file, start, duration: clip.duration });
}

function narrate(lines, gap = 0.45) {
  const out = [];
  for (const text of lines) {
    const clip = synth(text, VOICES.narrator);
    addClip(clip, clock);
    out.push({ text: display(text), start: clock, end: clock + clip.duration, env: envelope(clip.samples) });
    timeline.subtitles.push(...chunks(display(text), clock, clip.duration).map(c => ({ ...c, speaker: 'Narrator' })));
    clock += clip.duration + gap;
  }
  return out;
}

function titleCard({ kicker, title, subtitle, lines, hold = 0.8 }) {
  const start = clock;
  clock += 0.6;
  const narration = narrate(lines);
  clock += hold;
  timeline.segments.push({ type: 'title', start, end: clock, kicker, title, subtitle, narration });
}

function screen({ image, caption, kicker, lines = [], taps = [], hold = 1.2, extra = {} }) {
  const start = clock;
  clock += 0.5;
  const narration = narrate(lines);
  clock += hold;
  timeline.segments.push({ type: 'screen', start, end: clock, image, caption, kicker, narration, taps: taps.map(tp => ({ ...tp, t: start + (tp.at ?? 0.6) })), ...extra });
}

function money(n) { return `$${n.toFixed(4)}`; }

function table({ kicker, title, subtitle, columns, rows, note, lines, hold = 2.5, highlight = [] }) {
  const start = clock;
  clock += 0.6;
  const narration = narrate(lines);
  clock += hold;
  timeline.segments.push({ type: 'table', start, end: clock, kicker, title, subtitle, columns, rows, note, highlight, narration });
}

/** Play a stretch of a real file (the call recording) under a screen. */
function playFile(wav, from, seconds) {
  const tmp = path.join(AUDIO, `rec-${clipNo++}.wav`);
  execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${RATE}`, '-c', '1', wav, tmp]);
  const pcm = readPcm(tmp);
  const cut = pcm.subarray(Math.round(from * RATE), Math.round((from + seconds) * RATE));
  const out = path.join(AUDIO, `rec-cut-${clipNo++}.wav`);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + cut.length * 2, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(cut.length * 2, 40);
  fs.writeFileSync(out, Buffer.concat([header, Buffer.from(cut.buffer, cut.byteOffset, cut.length * 2)]));
  return { file: out, samples: cut, duration: cut.length / RATE };
}

function callSegment(sc, { preTurns = [], postTurns = [], handoffImage = null, handoffAt = null, vipImage = null, brief = false } = {}) {
  const start = clock;
  clock += 0.8;
  const lines = [];
  const usage = sc.call?.aiUsage?.detail || [];
  let usageIdx = 0;
  let spent = 0;
  let tokens = 0;

  const pushLine = (speaker, text, voiceCfg, meta = {}) => {
    const clip = synth(text, voiceCfg);
    addClip(clip, clock);
    const line = { speaker, text, start: clock, end: clock + clip.duration, env: envelope(clip.samples), silent: !!clip.silent, ...meta };
    lines.push(line);
    const foreign = meta.lang && meta.lang !== 'en';
    const label = (speaker === 'ai' ? 'Vexa' : speaker === 'owner' ? 'You (Phani)' : sc.callerName) + (foreign ? ` · ${LANG_NAME[meta.lang] || meta.lang}` : '');
    // Subtitles in English, so every viewer can follow; the original script is on screen
    const subText = foreign && meta.en ? meta.en : text;
    timeline.subtitles.push(...chunks(subText, clock, clip.duration).map(c => ({ ...c, speaker: label, translated: foreign })));
    clock += clip.duration;
    return line;
  };

  // VIP handoff prompt before the conversation (trusted contact during Focus)
  if (vipImage) {
    lines.push({ speaker: 'system', text: 'Your app: “Amma is calling — pick up, or let Vexa handle it?”', start: clock, end: clock + 0.1, phoneImage: vipImage, tap: 'decline' });
    clock += 0.4;
    const n = narrate(['Your phone lights up: your mother is calling, and you are in Focus. You can pick up — or let Vexa handle it. You tap: let Vexa handle it.'], 0.3);
    lines.push(...n.map(x => ({ ...x, speaker: 'narrator', phoneImage: vipImage })));
  }

  const turns = [...preTurns, ...sc.turns];
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (t.speaker === 'caller') {
      pushLine('caller', t.text, callerVoice(sc, t.lang || 'en'), { lang: t.lang || 'en', en: t.en });
      clock += 0.25;
    } else if (t.speaker === 'ai') {
      // Thinking pause (shortened for viewing; the real latency is displayed)
      const thinkStart = clock;
      if (t.latencyMs) clock += 1.1;
      // usage consumed by this turn: understanding (+ directions if generated)
      let turnCost = 0;
      let turnTokens = 0;
      if (t.latencyMs) {
        const take = t.understanding?.workflow?.id === 'p_delivery' && /full address|Before you go in/.test(t.text) ? 2 : 1;
        for (let k = 0; k < take && usageIdx < usage.length; k++) {
          const u = usage[usageIdx];
          if (u.purpose === 'post-call analysis') break;
          turnCost += u.costUsd || 0;
          turnTokens += (u.inputTokens || 0) + (u.outputTokens || 0);
          usageIdx++;
        }
      }
      spent += turnCost;
      tokens += turnTokens;
      const lang = t.lang || 'en';
      pushLine('ai', t.text, lang in VEXA_BY_LANG ? VEXA_BY_LANG[lang] : VOICES.vexa, {
        lang, en: t.en, style: t.style,
        thinkStart,
        latencyMs: t.latencyMs || null,
        aiAssisted: t.aiAssisted,
        understanding: t.understanding,
        turnCost, turnTokens, spent, tokens
      });
      clock += 0.35;
    }
  }

  // Handoff to the owner (delivery OTP)
  if (handoffImage) {
    const hs = clock;
    lines.push({ speaker: 'system', text: 'Handoff → your phone', start: hs, end: hs + 0.1, phoneImage: handoffImage, tap: 'accept' });
    clock += 0.3;
    const n = narrate(['Here is the handoff. Your phone shows who is calling and Vexa’s brief. You tap pick up, and you are connected straight to the courier.'], 0.3);
    lines.push(...n.map(x => ({ ...x, speaker: 'narrator', phoneImage: handoffImage })));
    lines.push({ speaker: 'system', text: '✅ You joined the call', start: clock, end: clock + 0.1 });
    clock += 0.4;
  }
  for (const pt of postTurns) {
    if (pt.speaker === 'owner') pushLine('owner', pt.text, VOICES.owner);
    else pushLine('caller', pt.text, callerVoice(sc, 'en'));
    clock += 0.3;
  }

  // Post-call: analysis cost lands
  const analysis = usage.filter(u => u.purpose === 'post-call analysis');
  for (const u of analysis) { spent += u.costUsd || 0; tokens += (u.inputTokens || 0) + (u.outputTokens || 0); }
  const outcomeStart = clock + 0.4;
  clock = outcomeStart;
  const narr = brief ? [] : narrate([`Call summary: ${sc.call.summary}`], 0.4);
  clock += brief ? 3.2 : 2.2;
  timeline.segments.push({
    type: 'call', start, end: clock, scenario: { id: sc.id, title: sc.title, subtitle: sc.subtitle, callerName: sc.callerName, callerNumber: sc.callerNumber, risk: sc.risk, languages: sc.call.languages, summaryLocal: sc.call.summaryLocal, part: sc.part },
    lines, outcome: { start: outcomeStart, ...sc.call, totalCost: sc.call.aiUsage.costUsd, totalTokens: sc.call.aiUsage.inputTokens + sc.call.aiUsage.outputTokens },
    outcomeNarration: narr
  });
}

const S = Object.fromEntries(run.scenarios.map(s => [s.id, s]));
const recordedIST = new Date(run.recordedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
const hourIST = Number(new Date(run.recordedAt).toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }));
const recording = fs.existsSync(path.join(BUILD, 'recording.json')) ? JSON.parse(fs.readFileSync(path.join(BUILD, 'recording.json'), 'utf8')) : null;
const montage = run.scenarios.filter(s => s.part === '8');

// ── The film ────────────────────────────────────────────────────────────────
titleCard({
  kicker: 'Product walkthrough', title: 'Vexa', subtitle: 'The AI receptionist that answers, understands, acts — in your caller’s language — and only interrupts you when it matters.',
  lines: [
    'This is Vexa: an AI receptionist that answers your calls, follows step by step playbooks, speaks your caller’s language, and only interrupts you when it matters.',
    'Every call you are about to see was handled live by Claude, with real understanding and real token costs. The voices are synthesized for this recording.'
  ]
});

screen({ image: 'home-personal.png', kicker: 'Personal mode', caption: 'Home: your brief, shields and quick actions',
  lines: ['We start in Personal mode. This is your home screen: a brief of what Vexa handled, and shields to control who gets through.'] });

titleCard({ kicker: 'Scenario 1', title: 'Delivery executive', subtitle: S['1'].subtitle,
  lines: ['Scenario one. A delivery executive calls. Vexa asks where they are, guides them to Jasmine 77, Serene County, tells them what to say at the security gate, and hands the call to you only for the O T P.'] });
callSegment(S['1'], {
  handoffImage: 'handoff-delivery.png',
  postTurns: [
    { speaker: 'owner', text: 'Hi, this is Phani. The OTP is 4 7 2 9.' },
    { speaker: 'caller', text: 'Got it sir, 4 7 2 9. I will be there in five minutes. Thank you!' }
  ]
});

titleCard({ kicker: 'Scenario 2', title: 'Bank loan call', subtitle: S['2'].subtitle,
  lines: ['Scenario two. A bank calls with a personal loan. Instead of hanging up, Vexa collects the offer, asks for the rate and the tenure, and negotiates the rate down.'] });
callSegment(S['2']);
screen({ image: 'call-loan.png', kicker: 'After the call', caption: 'What Vexa captured, the negotiated rate, and what the call cost',
  lines: ['After the call you see exactly what Vexa captured, including the loan amount in lakh, the negotiated rate, and what the call cost.'] });

titleCard({ kicker: 'Scenario 3', title: 'Trusted contact while you are busy', subtitle: S['3'].subtitle,
  lines: [
    'Scenario three. You tell Vexa you are busy, and will be available after 7 P M today.',
    hourIST >= 19
      ? `This was recorded at ${recordedIST} in Hyderabad, after 7 P M, so Vexa sets Focus until 7 P M tomorrow, and says so.`
      : `This was recorded at ${recordedIST} in Hyderabad, so Vexa turns on Focus until 7 P M today.`
  ] });
screen({ image: 'ask-vexa.png', kicker: 'Ask Vexa', caption: `“${run.commands[0].text}” → ${run.commands[0].reply}`,
  lines: ['You just say it in plain words. Vexa turns on Focus, with the right end time.'] });
callSegment(S['3'], { vipImage: 'handoff-vip.png' });
screen({ image: 'call-amma.png', kicker: 'On your phone', caption: 'The message you get: who called, why, and what Vexa told them',
  lines: ['And this is the message you get on your phone: who called, why, and exactly what Vexa told her. Call back with one tap.'] });

titleCard({ kicker: 'Scenario 4', title: 'Switch to Business', subtitle: 'One tap on the home screen — the same assistant becomes your receptionist',
  lines: ['Now let us switch to Business, right from the home screen.'] });
screen({ image: 'home-switch.png', kicker: 'Home', caption: 'Tap “Business”', taps: [{ at: 1.2, target: 'mode-business' }], hold: 0.6,
  lines: ['One tap.'] });
screen({ image: 'home-business.png', kicker: 'Business mode', caption: 'Serene Home Essentials — receptionist flows are on',
  lines: ['The same assistant is now the receptionist for Serene Home Essentials, with your catalog, hours and booking flows.'] });

titleCard({ kicker: 'Scenario 4.a', title: 'Appointment booking', subtitle: S['4.a'].subtitle,
  lines: ['Four A: an appointment. Vexa picks up the service, the date and the time from one sentence, asks only for what is missing, confirms, and creates a booking request.'] });
callSegment(S['4.a']);
screen({ image: 'bookings.png', kicker: 'Bookings', caption: 'Approve with one tap — the customer gets a confirmation text',
  lines: ['The request lands in Bookings. One tap confirms it and texts the customer.'] });

titleCard({ kicker: 'Scenario 4.b', title: 'Address & directions', subtitle: S['4.b'].subtitle,
  lines: ['Four B: directions. Vexa answers from your business profile, the address, the landmark and the parking, and your Sunday hours.'] });
callSegment(S['4.b']);

titleCard({ kicker: 'Scenario 4.c', title: 'Stock, price & total', subtitle: S['4.c'].subtitle,
  lines: ['Four C: stock and price. Vexa checks your catalog live, quotes the unit price and the total, and reserves the order.'] });
callSegment(S['4.c']);
screen({ image: 'products.png', kicker: 'Products & stock', caption: 'Prices and stock are read live from your catalog — never guessed',
  lines: ['Prices and stock come from your catalog, so Vexa never guesses a number.'] });

// ── 6–8: languages ─────────────────────────────────────────────────────────
titleCard({ kicker: 'Scenario 6', title: 'Your caller switches language', subtitle: 'English, Hindi, Telugu, Tamil, Malayalam, Marathi, Gujarati and Spanish — mid-call switching',
  lines: [
    'Vexa now speaks eight languages: English, Hindi, Telugu, Tamil, Malayalam, Marathi, Gujarati and Spanish.',
    'In this call the customer starts in Telugu, gives their name in Hindi, and confirms in English. Vexa follows every switch, and replies in the language the caller is using right now.'
  ] });
callSegment(S['6']);
screen({ image: 'ml-summary.png', kicker: 'After the call', caption: 'Summary in English and in the caller’s language — with every language spoken',
  lines: ['After the call, you get the summary in English, and in the caller’s language, with the languages they used.'] });
screen({ image: 'ml-transcript.png', kicker: 'Bilingual transcript', caption: 'Every line as it was spoken — with the English right under it',
  lines: ['The transcript keeps every line exactly as it was spoken, with the English right under it. Switch between both, as spoken, or English only.'] });
screen({ image: 'ml-gujarati.png', kicker: 'Read in…', caption: `Read the whole call in any of eight languages — here, Gujarati (${run.translation ? money(run.translation.aiUsage?.costUsd || 0) : 'one request'}, cached)`,
  lines: [`And you can read the whole call in any of the eight languages. Here it is in Gujarati. That took one request, ${run.translation ? `about ${((run.translation.aiUsage?.costUsd || 0) * 100).toFixed(1)} cents` : 'a fraction of a cent'}, and it is saved for next time.`] });

titleCard({ kicker: 'Scenario 7', title: 'Hinglish, the way people actually talk', subtitle: S['7'].subtitle,
  lines: ['Most callers in India mix languages. This customer speaks Hinglish, Hindi and English together, typed in English letters. Vexa understands it, and replies the same way.'] });
callSegment(S['7']);
screen({ image: 'hinglish-transcript.png', kicker: 'Call detail', caption: 'Hinglish in, Hinglish out — with the English for you',
  lines: ['Hinglish in, Hinglish out, and the English for you.'] });

titleCard({ kicker: 'Scenario 8', title: 'Six more ways callers talk', subtitle: 'Tenglish · Tamil · Malayalam · Marathi · Gujarati · Spanish — one question each',
  lines: ['Six more callers, one question each: Telugu mixed with English, Tamil, Malayalam, Marathi, Gujarati and Spanish. This Mac has no Malayalam or Gujarati voice, so those two are shown as text.'] });
for (const sc of montage) callSegment(sc, { brief: true });

// ── 9: recording ────────────────────────────────────────────────────────────
titleCard({ kicker: 'Part 9', title: 'Call recording', subtitle: 'Both sides in stereo · tap any line to jump to it · auto-delete · “this call may be recorded”',
  lines: ['Phone calls are now recorded. Both sides, in stereo: the caller on the left, Vexa on the right, straight from the phone line, with no extra telephony cost.'] });
if (recording) {
  const recFile = path.join(here, '../backend/.data/recordings', recording.file);
  const start = clock;
  clock += 0.5;
  const narr = narrate(['Here is the recording of the language switching call. Tap any line in the transcript, and it jumps to that moment.'], 0.3);
  const clip = playFile(recFile, 0, Math.min(14, recording.durationSec));
  addClip(clip, clock);
  const played = { text: '▶ Playing the call recording (caller left · Vexa right)', start: clock, end: clock + clip.duration, env: envelope(clip.samples) };
  timeline.subtitles.push({ text: 'Playing the call recording — caller on the left, Vexa on the right', start: clock, end: clock + clip.duration, speaker: 'Recording' });
  clock += clip.duration + 0.8;
  timeline.segments.push({ type: 'screen', start, end: clock, image: 'ml-recording.png', kicker: 'Recording', caption: `${recording.durationSec}s · stereo · caller ◀ ▶ Vexa`, narration: [...narr, played], taps: [] });
}
screen({ image: 'settings-recording.png', kicker: 'Recording & privacy', caption: 'Turn it on or off, announce it to callers, auto-delete after 7–365 days',
  lines: ['You decide: record or not, tell callers the call may be recorded, and how long to keep the audio. Transcripts stay, audio is deleted automatically.'] });
screen({ image: 'settings-voice.png', kicker: 'Voice & language', caption: 'Pick the greeting language — Vexa switches the moment the caller does',
  lines: ['Pick the language Vexa greets in. It switches the moment your caller does.'] });

// ── 10: built for how India talks ──────────────────────────────────────────
table({
  kicker: 'Part 10', title: 'Built for how India talks', subtitle: 'What Vexa now understands — with the model, and even when the model is slow or offline',
  columns: ['Callers say', 'Example', 'Vexa captures'],
  rows: [
    ['Hinglish', 'kal subah 11 baje AC service chahiye', 'AC service · tomorrow 11am'],
    ['Tenglish / Tanglish', 'repu saayantram 5 gantalaki · naalaikku 10 manikku', 'tomorrow 5pm · tomorrow 10am'],
    ['Indian numbers', 'dedh lakh · saade gyarah percent · padi kavali', '₹1,50,000 · 11.5% · 10'],
    ['Yes / no, every language', 'haan ji · avunu · aamaa · athe · ho · barabar · illai-nga', 'yes … no'],
    ['Spoken phone numbers', 'double nine four eight triple five…', '+91 99485 55678'],
    ['Indian English', 'prepone · out of station · same day itself · lakh', 'understood as meant'],
    ['“haan”, “hmm” while Vexa talks', 'listening, not interrupting', 'Vexa keeps talking']
  ],
  lines: ['Callers in India mix languages, type them in English letters, and count in lakhs. Vexa now understands all of that: dates like kal and parso, numbers like dedh lakh, yes and no in every language, and Indian English. And a quick haan or hmm while Vexa is talking no longer cuts it off.']
});
table({
  kicker: 'Part 10', title: 'Measured, not guessed', subtitle: '157 test utterances in 8 languages, plus 50 new phrasings held back from tuning',
  columns: ['', 'Before', 'Now', 'Held-out'],
  rows: [
    ['Without the model (slow network, outage)', '15%', '99%', '98%'],
    ['With Claude Opus 5.5', '80%', '100%', '100%'],
    ['Claude cost per caller sentence', '$0.0087', '$0.0114', '—']
  ],
  highlight: [0, 1],
  note: 'Text understanding. Accents in real phone audio are the next step: Indian speech engines, measured on recordings of real speakers.',
  lines: ['We measured it. On one hundred and fifty seven test sentences, Vexa without the model went from fifteen percent to ninety nine. With Claude, from eighty to one hundred percent, and the same on fifty new phrasings we never tuned for. Next: Indian speech engines, measured on real voices over real phone lines.']
});

// ── 11: the platform ────────────────────────────────────────────────────────
titleCard({ kicker: 'Part 11', title: 'How Vexa works', subtitle: 'Understanding by Claude · decisions by a flow engine · results you can act on',
  lines: ['How it works. Claude understands what the caller says, in any of the eight languages. A flow engine then decides exactly what to ask next, when to confirm, when to transfer, and when to hang up. That keeps calls predictable, fast and cheap.'] });
screen({ image: 'flows.png', kicker: 'Flows', caption: 'Playbooks for every kind of call — with live stats',
  lines: ['Flows are playbooks for each kind of call: deliveries, bank offers, family, bookings, directions, stock. You can see how many questions Vexa skipped because callers already answered them.'] });
screen({ image: 'flow-editor.png', kicker: 'Flow editor', caption: 'Ask · confirm · branch · act · transfer — editable from your phone',
  lines: ['Every step can be edited from your phone: ask, confirm, branch, act or transfer.'] });
screen({ image: 'activity.png', kicker: 'Activity', caption: 'Every call: summary, flow, outcome and follow-up',
  lines: ['Activity shows every call with its summary, the flow it followed, and what needs your follow-up.'] });
screen({ image: 'call-fans.png', kicker: 'Call detail', caption: 'Captured facts, actions taken, reply draft, and the exact AI cost',
  lines: ['Each call shows the facts Vexa captured, the actions it took, a ready to send reply, and the exact AI cost.'] });

// ── Costs ───────────────────────────────────────────────────────────────────
const sum = (list, k) => list.reduce((a, c) => a + (c[k] || 0), 0);
const rowOf = (id, title, u) => ({ id, title, requests: u.requests, inputTokens: u.inputTokens, outputTokens: u.outputTokens, costUsd: u.costUsd });
const mainCalls = run.scenarios.filter(s => s.part !== '8');
const costs = mainCalls.map(s => rowOf(s.id, s.title, s.call.aiUsage));
if (montage.length) {
  const us = montage.map(s => s.call.aiUsage);
  costs.push({ id: '8', title: `Six more languages (${montage.length} calls)`, requests: sum(us, 'requests'), inputTokens: sum(us, 'inputTokens'), outputTokens: sum(us, 'outputTokens'), costUsd: sum(us, 'costUsd') });
}
const extras = [];
if (run.commands[0]?.aiUsage) extras.push(rowOf('3*', 'Ask Vexa: “busy until 7 PM”', run.commands[0].aiUsage));
if (run.translation?.aiUsage) extras.push(rowOf('6*', 'Read call 6 in Gujarati', run.translation.aiUsage));
const all = [...costs, ...extras];
const total = sum(all, 'costUsd');
const totalTokens = all.reduce((a, c) => a + c.inputTokens + c.outputTokens, 0);
const callCount = mainCalls.length + montage.length;
const costStart = clock;
clock += 0.6;
const costNarr = narrate([
  `Finally, what it cost. All ${callCount} calls, plus the two extra requests, used ${totalTokens.toLocaleString('en-US')} tokens on Claude Opus 5.5, for a total of about ${(total * 100).toFixed(0)} cents. That is roughly ${(sum(costs, 'costUsd') / callCount * 100).toFixed(1)} cents per call, or about ${Math.round(sum(costs, 'costUsd') / callCount * 84 * 100) / 100} rupees.`,
  'A multilingual call costs a little more, because Vexa also translates its replies.'
]);
clock += 3;
timeline.segments.push({ type: 'costs', start: costStart, end: clock, costs: all, total, totalTokens, narration: costNarr });

// ── What's next ─────────────────────────────────────────────────────────────
table({
  kicker: 'What’s next', title: 'India-first roadmap', subtitle: 'Each phase ships something callers and owners can feel',
  columns: ['Phase', 'Outcome', 'Status'],
  rows: [
    ['1 · Indian speech', 'Mixed languages and Indian accents understood; Indian voices reply', 'Text understanding done · speech engines next'],
    ['2 · Real calls live', 'Indian number, replies start within 1.5 seconds, pilot with 8 users', 'Next'],
    ['3 · Android app', 'Play Store, WhatsApp alerts, UPI subscription', 'Planned'],
    ['4 · Business tools', 'WhatsApp catalog, UPI payment links on calls, calendar, stock sync', 'Planned'],
    ['5 · Scale & compliance', 'DPDP data law, SMS template registration, many servers', 'Planned']
  ],
  highlight: [0],
  lines: [
    'What is next: Indian speech engines and Indian voices, then a real Indian phone number with replies inside one and a half seconds, then the Android app with WhatsApp and U P I, and business tools.',
    'Vexa: every call answered, in your caller’s language, and you are only interrupted when it matters.'
  ],
  hold: 3
});

timeline.duration = clock;

// ── Mix audio ───────────────────────────────────────────────────────────────
const mix = new Int16Array(Math.ceil(clock * RATE) + RATE);
for (const c of timeline.clips) {
  const pcm = readPcm(c.file);
  const at = Math.round(c.start * RATE);
  for (let i = 0; i < pcm.length; i++) mix[at + i] = Math.max(-32768, Math.min(32767, mix[at + i] + pcm[i]));
}
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + mix.length * 2, 4); header.write('WAVE', 8);
header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
header.write('data', 36); header.writeUInt32LE(mix.length * 2, 40);
fs.writeFileSync(path.join(AUDIO, 'mix.wav'), Buffer.concat([header, Buffer.from(mix.buffer)]));

// ── Subtitles (SRT) ─────────────────────────────────────────────────────────
const ts = s => {
  const ms = Math.round(s * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor(ms / 60000) % 60).padStart(2, '0');
  const sec = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
  return `${h}:${m}:${sec},${String(ms % 1000).padStart(3, '0')}`;
};
const srt = timeline.subtitles.sort((a, b) => a.start - b.start).map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.speaker}: ${c.text}\n`).join('\n');
fs.writeFileSync(path.join(BUILD, 'vexa-demo.srt'), srt);

// clips keep only what the player needs
timeline.clips = timeline.clips.map(c => ({ start: c.start, duration: c.duration }));
fs.writeFileSync(path.join(BUILD, 'timeline.json'), JSON.stringify(timeline));
console.log(`Timeline: ${clock.toFixed(1)}s, ${timeline.segments.length} segments, ${timeline.subtitles.length} subtitle cues, total AI cost $${total.toFixed(4)}`);
