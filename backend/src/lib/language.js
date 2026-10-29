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

import { hasIndicScript } from './indic.js';

// Marathi-only markers (Devanagari is shared with Hindi)
const MARATHI = /(आहे|आहेत|नाही|मला|तुम्ही|काय|कसे|आणि|पाहिजे|झाले|करायचे|आम्ही|उद्या|वाजता|सकाळी)/;
const SPANISH = /[¿¡ñ]|\b(hola|quiero|gracias|necesito|buenos|buenas|por favor|cuánto|dónde|tienen|cita|mañana|señor|usted)\b/i;

// Indian languages typed or transcribed in English letters ("naaku repu kavali").
// A word listed under several languages counts for each, at lower weight.
const ROMANIZED = {
  hi: ['hai', 'hain', 'nahi', 'nahin', 'kya', 'mera', 'meri', 'mere', 'mujhe', 'humko', 'aap', 'aapka', 'aapki', 'aapko', 'kal', 'aaj', 'parso', 'baje', 'chahiye', 'chaiye', 'karna', 'karo', 'kijiye', 'dijiye', 'bol', 'raha', 'rahi', 'rahe', 'hoon', 'hun', 'mein', 'bhaiya', 'bhai', 'theek', 'thik', 'accha', 'achha', 'haan', 'kahan', 'kitna', 'kitne', 'shaam', 'subah', 'raat', 'dopahar', 'abhi', 'sakte', 'sakta', 'sakti', 'wala', 'wali', 'kuch', 'lekin', 'toh', 'bhi', 'yahan', 'wahan', 'kaise', 'kyun', 'naam', 'dus', 'paanch', 'ke', 'ki', 'ka', 'se', 'pe', 'ko', 'baare', 'aaya', 'aayi', 'khada', 'chalega', 'galat', 'sahi', 'bilkul', 'ji', 'dena', 'lena', 'jayega', 'hoga', 'gyarah', 'barah', 'saade', 'dedh', 'dhai', 'rupaye', 'teen', 'piece'],
  te: ['naaku', 'naku', 'nenu', 'meeru', 'mee', 'ekkada', 'enti', 'emiti', 'kavali', 'kaavali', 'ledu', 'undi', 'unnaya', 'unnara', 'unna', 'cheppandi', 'chesi', 'cheyyandi', 'repu', 'ellundi', 'ivvala', 'eeroju', 'gantalaki', 'gantalaku', 'andi', 'avunu', 'sare', 'peru', 'padi', 'moodu', 'okati', 'vastara', 'vastanu', 'kani', 'inka', 'entha', 'daggara', 'kosam', 'baagundi', 'udayam', 'saayantram', 'sayantram', 'rendu', 'aidu', 'vaddu', 'tappu', 'garu', 'na'],
  ta: ['enakku', 'naan', 'neenga', 'unga', 'enga', 'enna', 'venum', 'vendum', 'illa', 'illai', 'irukku', 'irukka', 'naalaikku', 'naalai', 'innaikku', 'kaalaila', 'manikku', 'mani', 'sari', 'aamaa', 'aama', 'podhum', 'kadai', 'varuveengala', 'varen', 'pannunga', 'panren', 'saayangaalam', 'madhiyam', 'moonu', 'rendu', 'en', 'peru', 'thappu', 'venda', 'anju', 'pathu', 'ah', 'possible'],
  ml: ['enikku', 'ente', 'njan', 'ningal', 'evide', 'evideya', 'enthu', 'venam', 'venda', 'undo', 'illa', 'alla', 'naale', 'raavile', 'manikku', 'randu', 'moonnu', 'sheri', 'athe', 'aanu', 'cheyyam', 'kada', 'vaikunneram', 'mattannaal', 'oru', 'ippo', 'peru', 'anju', 'pathu', 'thettanu'],
  mr: ['mala', 'mi', 'tumhi', 'aahe', 'aahet', 'nahi', 'pahije', 'pahijet', 'kay', 'kasa', 'kuthe', 'udya', 'parva', 'vajta', 'vajata', 'sakali', 'sandhyakali', 'maza', 'majha', 'naav', 'barobar', 'nako', 'ho', 'zala', 'kara', 'aamhi', 'ahe', 'chukicha', 'teen', 'don'],
  gu: ['mare', 'maru', 'tame', 'tamaru', 'che', 'chhe', 'nathi', 'joie', 'joiye', 'kem', 'kaale', 'savare', 'vage', 'vagye', 'saanje', 'barabar', 'khotu', 'haa', 'tran', 'ketla', 'aavo', 'shu', 'naam', 'be']
};
const MARKER_LANGS = {};
for (const [lang, words] of Object.entries(ROMANIZED)) for (const w of words) (MARKER_LANGS[w] ||= []).push(lang);

// Everyday English words callers mix into Indian languages ("AC service", "appointment", "delivery").
const ENGLISH_MIX = new Set(('service servicing appointment booking book delivery order gate morning evening afternoon night time bulb bulbs fan fans loan bank personal home sir madam please possible correct number address shop store location payment price cost rate stock available tomorrow today plumber electrician repair problem issue complaint call phone mobile message offer interest emi otp ok okay sorry thanks thank pickup cancel confirm reschedule minute minutes hour office doctor clinic report fix install installation tv fridge washing machine lift flat floor building society road cross near opposite left right straight parcel package courier amazon flipkart swiggy zomato card credit debit account policy insurance plan free discount urgent emergency water leak pipe light power current bill total piece pieces only also just already').split(' '));

// English grammar words: when these dominate, the sentence is English even with an Indian word in it
const EN_FUNCTION = new Set('the a an is are was were to of for in on at by with from up and or but if this that these those it its i you he she we they my your our their me him her us them can could will would should have has had do does did be been am not no yes what when where how which who why there here please sir madam'.split(' '));

/**
 * Language of one utterance, whether the caller mixed English into it, and the script they used.
 * Fallback only: on calls the model's per-utterance answer wins.
 * @returns {{ lang: string, mixed: boolean, script: 'native'|'latin' }}
 */
export function analyzeLanguage(text) {
  const t = String(text || '');
  const count = (re) => (t.match(re) || []).length;
  const latinWords = (t.match(/[A-Za-z][A-Za-z']+/g) || []);
  if (hasIndicScript(t)) {
    const scripts = [
      ['te', count(/[ఀ-౿]/g)],
      ['ta', count(/[஀-௿]/g)],
      ['ml', count(/[ഀ-ൿ]/g)],
      ['gu', count(/[઀-૿]/g)],
      ['dev', count(/[ऀ-ॿ]/g)]
    ].sort((a, b) => b[1] - a[1]);
    if (scripts[0][1] >= 2) {
      const lang = scripts[0][0] === 'dev' ? (MARATHI.test(t) ? 'mr' : 'hi') : scripts[0][0];
      return { lang, mixed: latinWords.length > 0, script: 'native' };
    }
  }
  if (SPANISH.test(t)) return { lang: 'es', mixed: false, script: 'latin' };

  const words = t.toLowerCase().match(/[a-z]+/g) || [];
  const score = {};
  for (const w of new Set(words)) {
    const langs = MARKER_LANGS[w];
    if (langs) for (const l of langs) score[l] = (score[l] || 0) + 2 / langs.length;
  }
  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
  const [top, second] = ranked;
  // An English sentence with one Indian word ("Up to five lakh, ji") is still English
  const englishGrammar = words.filter(w => EN_FUNCTION.has(w)).length;
  const indicWords = words.filter(w => MARKER_LANGS[w]).length;
  const english = englishGrammar >= 2 && englishGrammar >= indicWords * 1.5;
  if (top && top[1] >= 2 && (!second || top[1] > second[1]) && !english) {
    const english = latinWords.some(w => ENGLISH_MIX.has(w.toLowerCase()) || (/^[A-Z]{2,}$/.test(w) && w.length <= 6));
    return { lang: top[0], mixed: english, script: 'latin' };
  }
  return { lang: 'en', mixed: false, script: 'latin' };
}

/** Best-effort language code of an utterance (fallback only). */
export function detectLanguage(text) {
  return analyzeLanguage(text).lang;
}
