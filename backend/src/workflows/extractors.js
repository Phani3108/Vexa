/**
 * Offline NLU — deterministic slot extractors used by the workflow engine.
 *
 * Each extractor returns { value, display } or null. `asked` means the engine
 * just asked for this slot, so lenient parsing is allowed (e.g. a bare
 * "Dana" is accepted as a name, any text is accepted for a free-text slot).
 * When not asked, only high-confidence patterns fire — this is what lets a
 * caller fill several slots in one sentence without false positives.
 */

import { NAME_INTRO } from '../voice/ConversationAnalyzer.js';
import {
  L, R, alt, wordRx, normalizeDigits, parseIndianNumber, parseClock, yesNo, spokenDigits,
  DAY_WORDS, PERIOD_WORDS, HOUR_MARKERS, CLOCK_PREFIXES, CLOCK_WORDS, WEEKDAY_WORDS, ASAP_WORDS, WANT_WORDS,
  NAME_INTRO_INDIC, NAME_TRAILING, MAIN_SPEAKING
} from '../lib/indic.js';
import { detectLanguage } from '../lib/language.js';

const NOT_A_NAME = /\b(tomorrow|today|tonight|morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday|yes|yeah|yep|yup|nah|right|correct|that|that's|no|nope|okay|ok|sure|thanks|thank|hello|hi|hey|calling|about|need|want|looking|interested|from|the|a|my|it|is|i|im|just|well|um|uh|hmm+|huh|what|sorry|pardon|hello|who|why)\b/i;
const NATIVE_NAME_INTRO = /(?:मेरा नाम|मेरा नाव|माझे नाव|माझं नाव|माझे नाव|నా పేరు|నాపేరు|என் பெயர்|என் பேரு|என் பேர்|എന്റെ പേര്|મારું નામ|મારુ નામ)\s+([\p{L}\p{M}]+(?:\s+[\p{L}\p{M}]+)?)/u;
const NATIVE_NAME_TRAILING = /\s+(है|हूँ|हूं|आहे|છે|అండి|గారు)$/u;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function cap(s) {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

export function extractName(text, asked) {
  const intro = text.match(NAME_INTRO);
  if (intro && !NOT_A_NAME.test(intro[1].split(' ')[0])) return { value: intro[1], display: intro[1] };
  // "mera naam Ravi hai", "na peru Suresh", "my good name is…", "main Priya bol rahi hoon"
  const indic = text.match(NAME_INTRO_INDIC) || text.match(MAIN_SPEAKING);
  if (indic) {
    const v = cap(indic[1].replace(NAME_TRAILING, '').trim());
    if (v && !NOT_A_NAME.test(v.split(' ')[0])) return { value: v, display: v };
  }
  // Native script ("मेरा नाम अमित है", "నా పేరు రవి"): kept as spoken; the model transliterates when available
  const native = text.match(NATIVE_NAME_INTRO);
  if (native) {
    const v = native[1].replace(NATIVE_NAME_TRAILING, '').trim();
    if (v) return { value: v, display: v };
  }
  // "…it's Marco by the way": a capitalised word after "it's" (not a day/month/filler)
  const itsCap = text.match(/\b[Ii]t'?s\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
  if (itsCap && !NOT_A_NAME.test(itsCap[1].split(' ')[0]) && !/^(January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/.test(itsCap[1].split(' ')[0])) {
    return { value: itsCap[1], display: itsCap[1] };
  }
  const its = text.match(/\b(?:it'?s|name is)\s+([A-Za-z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
  if (asked && its && !NOT_A_NAME.test(its[1].split(' ')[0])) return { value: cap(its[1]), display: cap(its[1]) };
  if (asked) {
    const clean = text.trim().replace(/[.!?,]+$/, '').replace(/^(it'?s|this is|i'?m|my name is)\s+/i, '');
    const words = clean.split(/\s+/);
    if (words.length >= 1 && words.length <= 3 && words.every(w => /^[A-Za-z][A-Za-z'-]*$/.test(w)) && !words.some(w => NOT_A_NAME.test(w))) {
      const v = cap(clean);
      return { value: v, display: v };
    }
  }
  return null;
}

/**
 * Phone numbers, typed or spoken: "98490 01234", "nine eight four nine…", "double nine…",
 * "+91…", "0 98490…". Ten digits get the account's country code (India by default).
 */
export function extractPhone(text, { defaultCountry = process.env.DEFAULT_COUNTRY_CODE || '+91' } = {}) {
  const m = spokenDigits(text).replace(/[^\d+]/g, ' ').match(/\+?\d[\d ]{8,16}\d/);
  if (!m) return null;
  const plus = m[0].startsWith('+');
  let digits = m[0].replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  const cc = defaultCountry.replace(/\D/g, '');
  let e164;
  if (plus) e164 = `+${digits}`;
  else if (digits.length === 10) e164 = `+${cc}${digits}`;
  else if (digits.length === 11 && digits.startsWith('0')) e164 = `+${cc}${digits.slice(1)}`;  // trunk prefix
  else if (digits.length === 10 + cc.length && digits.startsWith(cc)) e164 = `+${digits}`;
  else e164 = `+${digits}`;
  return { value: e164, display: e164 };
}

export function extractEmail(text) {
  const spoken = text.replace(/\s+at\s+/gi, '@').replace(/\s+dot\s+/gi, '.');
  const m = spoken.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? { value: m[0].toLowerCase(), display: m[0].toLowerCase() } : null;
}

/** Yes/no in any supported language ("haan ji", "avunu", "illa", "nako", "हाँ"). */
export function extractYesNo(text) {
  const v = yesNo(text);
  return v === true ? { value: true, display: 'Yes' } : v === false ? { value: false, display: 'No' } : null;
}

const DAY_AFTER_RX = wordRx(DAY_WORDS.dayAfter);
const TOMORROW_RX = wordRx(DAY_WORDS.tomorrow);
const TODAY_RX = wordRx(DAY_WORDS.today);
const WEEKDAY_RX = WEEKDAY_WORDS.map(words => wordRx(words));
const PERIODS = Object.entries(PERIOD_WORDS).map(([name, words]) => [name, wordRx(words)]);
const ASAP_RX = wordRx(ASAP_WORDS);
const CLOCK = `(?:(${alt(CLOCK_PREFIXES)})\\s+)?(\\d{1,2}(?::\\d{2})?|${alt(CLOCK_WORDS)})`;
const MARKED_TIME_RX = new RegExp(`${L}${CLOCK}\\s*(?:${alt(HOUR_MARKERS)})${R}`, 'iu');
const PERIOD_THEN_NUMBER_RX = new RegExp(`${L}(?:${alt(Object.values(PERIOD_WORDS).flat())})\\s+(?:(?:at|ko|ki|around|about|approx|approximately|lagbhag|kareeb|takriban)\\s+)?${CLOCK}${R}(?!\\s*(?:am|pm|a\\.m|p\\.m))`, 'iu');
const HALF_QUARTER_RX = new RegExp(`\\b(half|quarter)\\s+(past|to)\\s+(\\d{1,2}|${alt(CLOCK_WORDS)})${R}`, 'iu');

function clockFrom(prefix, core) {
  if (/^\d{1,2}:\d{2}$/.test(core)) { const [h, m] = core.split(':').map(Number); return { h, m }; }
  return parseClock(prefix, core.toLowerCase());
}

/** 12-hour clock → 24-hour, using the time of day the caller mentioned. */
function to24(h, period) {
  if (h > 12) return h;
  if (period === 'morning') return h === 12 ? 12 : h;
  if (period === 'afternoon' || period === 'evening') return h < 12 ? h + 12 : h;
  if (period === 'night') return h === 12 ? 0 : h >= 5 ? h + 12 : h;
  return h < 8 ? h + 12 : h; // "at 3" during business context means 3pm
}

/**
 * Date/time parser for English and Indian languages ("kal shaam 5 baje", "repu 10 gantalaki",
 * "day after tomorrow", "half past three"). Returns a human display string and, when
 * possible, an ISO date (local to `now`) so bookings can be sorted.
 */
export function extractDateTime(text, asked, now = new Date()) {
  let t = normalizeDigits(text).toLowerCase();
  const parts = [];
  let date = null;

  if (ASAP_RX.test(t)) return { value: { text: 'ASAP' }, display: 'ASAP' };

  // Time of day first: "de la mañana" (morning) must not read as mañana (tomorrow)
  const period = PERIODS.find(([, rx]) => rx.test(t))?.[0] || null;
  t = t.replace(/\b(de|por) la (mañana|tarde|noche)\b/g, ' ');

  const addDays = (n) => { const d = new Date(now); d.setDate(d.getDate() + n); return d; };
  if (DAY_AFTER_RX.test(t)) { date = addDays(2); parts.push('day after tomorrow'); }
  else if (/\btonight\b|\bthis (morning|afternoon|evening)\b/.test(t) || TODAY_RX.test(t)) { date = new Date(now); parts.push('today'); }
  else if (TOMORROW_RX.test(t)) { date = addDays(1); parts.push('tomorrow'); }
  else if (/\bnext week\b/.test(t)) { date = addDays(7); parts.push('next week'); }
  else {
    const wd = WEEKDAY_RX.findIndex(rx => rx.test(t));
    if (wd >= 0) {
      date = new Date(now);
      const delta = (wd - now.getDay() + 7) % 7 || 7;
      date.setDate(now.getDate() + delta);
      parts.push(`${/\bnext\b/.test(t) ? 'next ' : ''}${cap(WEEKDAYS[wd])}`);
    } else {
      const md = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(st|nd|rd|th)?\b/);
      if (md) {
        const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(md[1]);
        date = new Date(now.getFullYear(), month, Number(md[2]));
        if (date < now) date.setFullYear(now.getFullYear() + 1);
        parts.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      }
    }
  }

  // Clock time, most explicit form first
  let h = null, m = 0;
  const ampm = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.?|p\.m\.?)(?![a-z])/);
  const hq = !ampm && t.match(HALF_QUARTER_RX);
  const marked = !ampm && !hq && t.match(MARKED_TIME_RX);
  const afterPeriod = !ampm && !hq && !marked && t.match(PERIOD_THEN_NUMBER_RX);
  const at = !ampm && !hq && !marked && !afterPeriod && (t.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\b/) || t.match(/\ba las (\d{1,2})(?::(\d{2}))?\b/));
  if (ampm) {
    h = Number(ampm[1]); m = Number(ampm[2] || 0);
    const pm = ampm[3].startsWith('p');
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  } else if (hq) {
    const base = clockFrom(null, hq[3]);
    if (base) {
      const mins = hq[1] === 'half' ? 30 : 15;
      h = hq[2] === 'past' ? base.h : base.h - 1;
      m = hq[2] === 'past' ? mins : 60 - mins;
      h = to24(h, period);
    }
  } else if (marked || afterPeriod) {
    const c = clockFrom((marked || afterPeriod)[1], (marked || afterPeriod)[2]);
    if (c) { h = to24(c.h, period); m = c.m; }
  } else if (at) {
    h = to24(Number(at[1]), period); m = Number(at[2] || 0);
  }

  if (h != null) {
    if (date) date.setHours(h, m, 0, 0);
    parts.push(`${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}`);
  } else if (period) {
    parts.push(/\btonight\b/.test(t) ? 'night' : period);
  } else {
    const pod = t.match(/\b(noon|lunch ?time|after work|end of (the )?day)\b/);
    if (pod) parts.push(pod[0]);
    else if (/\bafter (\d{1,2})\b/.test(t)) parts.push(t.match(/\bafter \d{1,2}(\s*(am|pm))?/)[0]);
  }

  if (/\b(any ?time|whenever|flexible|doesn'?t matter)\b/.test(t) && parts.length === 0) parts.push('any time');

  if (parts.length === 0) {
    return asked && t.trim().length > 1 && !isQuestion(text) ? { value: { text: text.trim() }, display: text.trim().slice(0, 60) } : null;
  }
  const display = parts.join(' ');
  return { value: { text: display, iso: date ? date.toISOString() : null }, display };
}

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, fifty: 50, hundred: 100, dozen: 12, 'a dozen': 12, 'half a dozen': 6, 'a couple': 2, couple: 2, single: 1, 'a pair': 2, pair: 2 };
const NUMBER_WORD_RX = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join('|')})\\b`, 'i');

/** First number: digits, English words, Indian words ("dus", "padi", "saade gyarah", "dedh lakh"). */
export function extractNumber(text) {
  text = String(text).replace(/(\d)(?=[a-z])/gi, '$1 ');   // "2BHK", "5kg" → "2 BHK", "5 kg"
  const phrase = text.toLowerCase().match(/\b(half a dozen|a dozen|a couple|couple|a pair|pair|single)\b/);
  if (phrase && !/\d/.test(text)) return { value: NUMBER_WORDS[phrase[1]], display: String(NUMBER_WORDS[phrase[1]]) };
  const n = parseIndianNumber(text, { allowAmbiguous: detectLanguage(text) !== 'en' || text.trim().split(/\s+/).length <= 2 });
  if (n) return { value: n.value, display: String(n.value) };
  const w = text.toLowerCase().match(NUMBER_WORD_RX);
  return w ? { value: NUMBER_WORDS[w[1].toLowerCase()], display: String(NUMBER_WORDS[w[1].toLowerCase()]) } : null;
}

/** Money: "dedh lakh", "₹2,50,000", "5 lakh", "1.5 crore" → 150000 etc. Shown Indian-style (₹1,50,000). */
export function extractAmount(text, asked) {
  const n = parseIndianNumber(text, { allowAmbiguous: true });
  if (!n || (!asked && !n.hasMultiplier && !/[₹$]|\brs\.?|rupee|rupaye|rupay|inr\b/i.test(text))) return asked ? extractText(text, asked) : null;
  const usd = /\$|dollar/i.test(text);
  const display = usd ? `$${n.value.toLocaleString('en-US')}` : `₹${n.value.toLocaleString('en-IN')}`;
  return { value: n.value, display };
}

export function extractChoice(text, options = []) {
  const t = text.toLowerCase();
  for (const opt of options) {
    const words = [opt.value, ...(opt.synonyms || [])].map(s => s.toLowerCase());
    if (words.some(w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t))) {
      return { value: opt.value, display: opt.label || opt.value };
    }
  }
  return null;
}

/** Free text: only when the slot was asked; strips filler. */
export function extractText(text, asked) {
  if (!asked) return null;
  const clean = text.trim().replace(/^(um+|uh+|so|well|yeah|yes|okay|ok)[,\s]+/i, '').replace(/[\s.]+$/, '');
  if (clean.length < 2 || /^(no|nope|nothing|none|not sure|i don'?t know)$/i.test(clean)) {
    return /^(no|nope|nothing|none|not sure|i don'?t know)$/i.test(clean) ? { value: null, display: '—', declined: true } : null;
  }
  return { value: clean.slice(0, 300), display: clean.slice(0, 120) };
}

/** Company detection for deliveries — matches the first-utterance "I'm from Amazon". */
const COMPANIES = ['amazon', 'ups', 'fedex', 'usps', 'dhl', 'doordash', 'uber eats', 'ubereats', 'grubhub', 'instacart', 'swiggy', 'zomato', 'blinkit', 'zepto', 'flipkart', 'bigbasket', 'delhivery', 'bluedart', 'dunzo', 'instamart', 'postmates', 'gopuff'];
export function extractCompany(text, asked) {
  const t = text.toLowerCase();
  const hit = COMPANIES.find(c => new RegExp(`\\b${c}\\b`).test(t));
  if (hit) return { value: cap(hit), display: cap(hit) };
  const from = text.match(/\bfrom\s+([A-Z][\w&]+(?:\s+[A-Z][\w&]+)?)/);
  if (from) return { value: from[1], display: from[1] };
  return extractText(text, asked);
}

const EXTRACTORS = {
  name: extractName,
  phone: (t) => extractPhone(t),
  amount: extractAmount,
  email: (t) => extractEmail(t),
  yesno: (t, asked) => (asked ? extractYesNo(t) : null),
  datetime: extractDateTime,
  number: (t, asked) => (asked ? extractNumber(t) : null),
  company: extractCompany,
  text: extractText,
  address: (t, asked) => {
    if (/\b\d{1,6}\s+[A-Za-z].*\b(st|street|ave|avenue|rd|road|blvd|lane|ln|dr|drive|way|ct|court|pl|place|hwy|pkwy)\b/i.test(t)) {
      const m = t.match(/\b\d{1,6}\s+[^,.!?]+(?:,\s*[^,.!?]+)?/);
      return { value: m[0].trim(), display: m[0].trim() };
    }
    const zip = t.match(/\b\d{5}(?:-\d{4})?\b/);
    if (zip) return { value: zip[0], display: `zip ${zip[0]}` };
    return extractText(t, asked);
  }
};

/** Quantity stated in passing: "I need 3", "10 pieces", "a couple" */
export function extractQuantity(text) {
  const t = text.toLowerCase();
  const m = t.match(/\b(?:need|want|buy|get|order|take|reserve)\s+(\d{1,4})\b/) || t.match(/\b(\d{1,4})\s*(?:pcs|pieces|units|nos|numbers|of them|items|packs|boxes)\b/);
  if (m) return { value: Number(m[1]), display: m[1] };
  const w = t.match(/\b(?:need|want|buy|get|order|take|reserve)\s+([a-z]+(?: a dozen)?)\b/) || t.match(/\b([a-z]+)\s+(?:pcs|pieces|units|of them|items|packs|boxes)\b/);
  if (w) { const n = extractNumber(w[1]); if (n) return n; }
  if (/\b(a couple|couple of)\b/.test(t)) return { value: 2, display: '2' };
  // "dus chahiye", "padi kavali", "moonu fan venum", "be joie che": a number shortly before "want"
  const want = normalizeDigits(t).match(WANT_RX);
  if (want) {
    const n = parseIndianNumber(want[1], { allowAmbiguous: true });
    if (n && n.value >= 1 && n.value <= 9999) return { value: n.value, display: String(n.value) };
  }
  return null;
}
const WANT_RX = new RegExp(`((?:[\\p{L}\\p{M}\\d]+\\s+){1,3})(?:${alt(WANT_WORDS)})${R}`, 'iu');

const ORDER_STOP = /(?:,|;|\.|\band\b|\baur\b|\bplus\b|\bthen\b|\balso\b|&|\+|\bmariyu\b|\bmarupadi\b|\bum\b|\bpinne\b|\bani\b|\bane\b)/gi;
const singular = (w) => w.replace(/(\p{L}{3,})(?:es|s)$/u, '$1');

/**
 * Several items with quantities, matched against the catalog by name or alias:
 * "2 paneer tikka aur 4 roti", "do pankha, dus bulb", "3 x Masala dosa; 1 x Coffee".
 * Returns { value: [{ name, qty }], display } or null when nothing in the catalog is named.
 */
export function extractOrder(text, catalog = []) {
  const t = normalizeDigits(String(text || '')).toLowerCase().replace(/[×*]/g, ' x ');
  // Longest names first, so "paneer tikka" wins over "tikka"
  const names = catalog.flatMap(item => [item.name, ...(item.aliases || [])].filter(Boolean).map(n => ({ item, n: String(n).toLowerCase() })))
    .sort((a, b) => b.n.length - a.n.length);
  const taken = [];
  const hits = [];
  for (const { item, n } of names) {
    const pat = n.split(/\s+/).map(w => singular(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:e?s)?').join('\\s+');
    const re = new RegExp(`${L}${pat}${R}`, 'giu');
    for (const m of t.matchAll(re)) {
      const start = m.index, end = m.index + m[0].length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      taken.push([start, end]);
      hits.push({ item, start, end });
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => a.start - b.start);
  const lines = new Map();
  hits.forEach((h, i) => {
    // Quantity: the number just before the item (within its clause), else "x 2" just after
    const prevEnd = i ? hits[i - 1].end : 0;
    let before = t.slice(prevEnd, h.start);
    const stops = [...before.matchAll(ORDER_STOP)];
    if (stops.length) before = before.slice(stops[stops.length - 1].index + stops[stops.length - 1][0].length);
    const words = before.trim().split(/\s+/).filter(Boolean).slice(-3);
    let qty = null;
    for (let k = 0; k < words.length && qty == null; k++) {
      const n = parseIndianNumber(words.slice(k).join(' '), { allowAmbiguous: true });
      if (n && n.value > 0 && n.value < 1000) qty = n.value;
    }
    if (qty == null) {
      const after = t.slice(h.end, (hits[i + 1]?.start ?? t.length)).match(/^\s*(?:x|nos?|pieces?|pcs|plates?)?\s*(\d{1,3})\b/);
      if (after) qty = Number(after[1]);
    }
    lines.set(h.item.name, { name: h.item.name, qty: Math.max(1, Math.round(qty ?? 1)) });
  });
  const value = [...lines.values()];
  return { value, display: value.map(l => `${l.qty} × ${l.name}`).join(', ') };
}

/** @param ctx.country default country code for 10-digit phone numbers ('+91', '+1'); ctx.catalog for orders */
export function extractSlot(slot, text, asked, now, ctx = {}) {
  if (slot.type === 'choice') return extractChoice(text, slot.options || []);
  if (slot.type === 'order') return extractOrder(text, ctx.catalog || []);
  if (slot.type === 'number' && !asked) {
    if (slot.key === 'quantity') return extractQuantity(text);
    // A number with its unit is safe to take unasked: "2BHK", "4 people", "3 kids", "table for 4"
    if (slot.unit || slot.unitBefore) {
      const t = normalizeDigits(text);
      const m = (slot.unit && t.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:${slot.unit})`, 'i')))
        || (slot.unitBefore && t.match(new RegExp(`\\b(?:${slot.unitBefore})\\s+(\\d+)\\b`, 'i')));
      return m ? { value: Number(m[1]), display: m[1] } : null;
    }
    return null;
  }
  if (slot.type === 'phone') return extractPhone(text, ctx.country ? { defaultCountry: ctx.country } : undefined);
  const fn = EXTRACTORS[slot.type] || EXTRACTORS.text;
  return fn(text, asked, now);
}

export function isQuestion(text) {
  const t = text.trim().toLowerCase();
  return /\?\s*$/.test(t) || /^(what|when|where|how|do|does|are|is|can|could|will|would|which|who|why)\b/.test(t);
}

export function wantsHuman(text) {
  return /\b(speak|talk) (to|with) (a )?(human|person|someone|owner|manager|real person|somebody)\b|\b(real person|human being|operator)\b|\bput (me|them) through\b|\bconnect me\b/i.test(text);
}

export function isGoodbye(text) {
  return /^(bye|goodbye|that'?s all|that is all|nothing else|no,? (that'?s (it|all)|thanks|thank you|nothing)|thanks,? bye|ok bye|i have to go|gotta go)\b/i.test(text.trim());
}
