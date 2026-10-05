/**
 * Translation for multilingual calls (Claude).
 *
 *   translateText()  — one receptionist line into the caller's language (live, per turn)
 *   translateLines() — many lines in one request (post-call transcripts, on-demand views)
 *
 * Lines repeat a lot ("Could I get your name, please?"), so results are cached.
 */

import { structuredJson, llmAvailable } from './llm.js';
import { strictObject } from './claude.js';
import { languageName } from './language.js';

const cache = new Map();
const MAX_CACHE = 2000;

const STYLE = `Write it the way a friendly receptionist would actually say it on a phone call in that language.
For Indian languages use the natural everyday register, keeping English words people commonly use on calls (OTP, order, booking, address, delivery, loan, EMI, AC service) as they are.
Keep names, addresses, numbers, prices (₹, $), times and dates exactly as given — do not convert currencies or reformat numbers.
Do not add or remove information.`;

function remember(key, value) {
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, value);
}

/** Translate one line from English into `lang`. Returns the original on any failure. */
export async function translateText(text, lang, { timeoutMs = 8000 } = {}) {
  if (!text || !lang || lang === 'en' || !llmAvailable()) return text;
  const key = `${lang}::${text}`;
  if (cache.has(key)) return cache.get(key);
  try {
    const out = await structuredJson({
      effort: 'low',
      maxTokens: 2000,
      timeoutMs,
      purposeModel: 'fast',
      schema: strictObject({ translation: { type: 'string' } }),
      system: `Translate the receptionist's line from English into ${languageName(lang)}. ${STYLE}`,
      user: text
    });
    const result = out.translation?.trim() || text;
    remember(key, result);
    return result;
  } catch (err) {
    console.warn(`Translation to ${lang} failed, using English: ${err.message}`);
    return text;
  }
}

/**
 * Translate many lines into `targetLang` in one request.
 * @param {{text: string, lang?: string}[]} lines
 * @returns {Promise<string[]>} same order; falls back to originals on failure
 */
export async function translateLines(lines, targetLang, { timeoutMs = 30000 } = {}) {
  if (!lines.length) return [];
  const todo = lines.map((l, i) => ({ i, text: l.text, from: l.lang || 'auto' }))
    .filter(l => !(l.from === targetLang) && !cache.has(`${targetLang}::${l.text}`));
  const out = lines.map(l => (l.lang === targetLang ? l.text : cache.get(`${targetLang}::${l.text}`) || null));
  if (todo.length && llmAvailable()) {
    try {
      const res = await structuredJson({
        effort: 'low',
        maxTokens: 8000,
        timeoutMs,
        schema: strictObject({ translations: { type: 'array', items: { type: 'string' } } }),
        system: `Translate each phone-call line into ${languageName(targetLang)}. Lines may be in different languages (callers switch). Return exactly one translation per input line, in the same order. ${STYLE}`,
        user: JSON.stringify(todo.map(t => t.text))
      });
      (res.translations || []).forEach((tr, k) => {
        const item = todo[k];
        if (item && typeof tr === 'string' && tr.trim()) {
          out[item.i] = tr.trim();
          remember(`${targetLang}::${item.text}`, tr.trim());
        }
      });
    } catch (err) {
      console.warn(`Batch translation to ${targetLang} failed: ${err.message}`);
    }
  }
  return out.map((t, i) => t ?? lines[i].text);
}
