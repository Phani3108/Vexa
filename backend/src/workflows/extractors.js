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

const NOT_A_NAME = /\b(tomorrow|today|tonight|morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday|yes|yeah|yep|yup|nah|right|correct|that|that's|no|nope|okay|ok|sure|thanks|thank|hello|hi|hey|calling|about|need|want|looking|interested|from|the|a|my|it|is|i|im|just|well|um|uh|hmm+|huh|what|sorry|pardon|hello|who|why)\b/i;
const YES = /^(yes|yeah|yep|yup|sure|correct|right|that'?s right|exactly|absolutely|definitely|of course|please do|go ahead|ok(ay)?|affirmative|haan|ha|ji haan)\b/i;
const NO = /^(no|nope|nah|not really|incorrect|wrong|that'?s wrong|negative|don'?t|do not|nahi|nahin)\b/i;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function cap(s) {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

export function extractName(text, asked) {
  const intro = text.match(NAME_INTRO);
  if (intro && !NOT_A_NAME.test(intro[1].split(' ')[0])) return { value: intro[1], display: intro[1] };
  // "…it's Marco by the way": a capitalised word after "it's" (not a day/month/filler)
  const itsCap = text.match(/\b[Ii]t'?s\s+([A-Z][a-z]+)\b/);
  if (itsCap && !NOT_A_NAME.test(itsCap[1]) && !/^(January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/.test(itsCap[1])) {
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

export function extractPhone(text) {
  const m = text.replace(/[^\d+]/g, ' ').match(/\+?\d[\d ]{8,16}\d/);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  const e164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  return { value: e164, display: e164 };
}

export function extractEmail(text) {
  const spoken = text.replace(/\s+at\s+/gi, '@').replace(/\s+dot\s+/gi, '.');
  const m = spoken.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? { value: m[0].toLowerCase(), display: m[0].toLowerCase() } : null;
}

export function extractYesNo(text) {
  const t = text.trim().toLowerCase();
  if (YES.test(t)) return { value: true, display: 'Yes' };
  if (NO.test(t)) return { value: false, display: 'No' };
  return null;
}

/**
 * Lightweight date/time parser. Returns a human display string and, when
 * possible, an ISO date (local to `now`) so bookings can be sorted.
 */
export function extractDateTime(text, asked, now = new Date()) {
  const t = text.toLowerCase();
  const parts = [];
  let date = null;

  if (/\b(asap|as soon as possible|right away|right now|immediately)\b/.test(t)) return { value: { text: 'ASAP' }, display: 'ASAP' };
  if (/\btoday\b|\bthis (morning|afternoon|evening)\b|\btonight\b/.test(t)) { date = new Date(now); parts.push('today'); }
  else if (/\btomorrow\b/.test(t)) { date = new Date(now.getTime() + 86400000); parts.push('tomorrow'); }
  else if (/\bnext week\b/.test(t)) { date = new Date(now.getTime() + 7 * 86400000); parts.push('next week'); }
  else {
    const wd = WEEKDAYS.findIndex(d => new RegExp(`\\b${d}\\b`).test(t));
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

  const tm = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/) || t.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\b/);
  if (tm) {
    let h = Number(tm[1]);
    const m = Number(tm[2] || 0);
    const ap = (tm[3] || '').replace(/\./g, '');
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (!ap && h < 8) h += 12; // "at 3" during business context means 3pm
    if (date) date.setHours(h, m, 0, 0);
    const disp = `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}`;
    parts.push(disp);
  } else {
    const pod = t.match(/\b(morning|afternoon|evening|night|noon|lunch ?time|after work|end of (the )?day)\b/);
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

export function extractNumber(text) {
  const m = text.match(/\b\d+(\.\d+)?\b/);
  if (m) return { value: Number(m[0]), display: m[0] };
  const w = text.toLowerCase().match(NUMBER_WORD_RX);
  return w ? { value: NUMBER_WORDS[w[1].toLowerCase()], display: String(NUMBER_WORDS[w[1].toLowerCase()]) } : null;
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
  return null;
}

export function extractSlot(slot, text, asked, now) {
  if (slot.type === 'choice') return extractChoice(text, slot.options || []);
  if (slot.type === 'number' && !asked) return slot.key === 'quantity' ? extractQuantity(text) : null;
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
