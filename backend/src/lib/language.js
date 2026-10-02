/**
 * Supported call languages.
 *
 * The flow engine always works in English; callers can speak any of these and
 * switch mid-call. Detection comes from the model (per utterance), with a
 * script-based fallback when no model is configured.
 */

export const LANGUAGES = {
  en: { name: 'English', native: 'English', bcp47: 'en-IN' },
  hi: { name: 'Hindi', native: 'हिन्दी', bcp47: 'hi-IN' },
  te: { name: 'Telugu', native: 'తెలుగు', bcp47: 'te-IN' },
  ta: { name: 'Tamil', native: 'தமிழ்', bcp47: 'ta-IN' },
  ml: { name: 'Malayalam', native: 'മലയാളം', bcp47: 'ml-IN' },
  mr: { name: 'Marathi', native: 'मराठी', bcp47: 'mr-IN' },
  gu: { name: 'Gujarati', native: 'ગુજરાતી', bcp47: 'gu-IN' },
  es: { name: 'Spanish', native: 'Español', bcp47: 'es-ES' }
};

export const LANGUAGE_CODES = Object.keys(LANGUAGES);

export function languageName(code) {
  return LANGUAGES[code]?.name || 'English';
}

export function normalizeLanguage(code) {
  const c = String(code || '').toLowerCase().slice(0, 2);
  return LANGUAGES[c] ? c : null;
}

// Marathi-only markers (Devanagari is shared with Hindi)
const MARATHI = /(आहे|आहेत|नाही|मला|तुम्ही|काय|कसे|आणि|पाहिजे|झाले|करायचे|आम्ही)/;
const SPANISH = /[¿¡ñ]|\b(hola|quiero|gracias|necesito|buenos|buenas|por favor|cuánto|dónde|tienen|cita|mañana|señor|usted)\b/i;

/** Best-effort language from the script/words of an utterance (fallback only). */
export function detectLanguage(text) {
  const t = String(text || '');
  const count = (re) => (t.match(re) || []).length;
  const scripts = [
    ['te', count(/[ఀ-౿]/g)],
    ['ta', count(/[஀-௿]/g)],
    ['ml', count(/[ഀ-ൿ]/g)],
    ['gu', count(/[઀-૿]/g)],
    ['dev', count(/[ऀ-ॿ]/g)]
  ].sort((a, b) => b[1] - a[1]);
  if (scripts[0][1] >= 2) {
    if (scripts[0][0] === 'dev') return MARATHI.test(t) ? 'mr' : 'hi';
    return scripts[0][0];
  }
  if (SPANISH.test(t)) return 'es';
  return 'en';
}
