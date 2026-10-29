/**
 * Indian-language lexicon for the offline understanding layer.
 *
 * The model handles most of this on its own; these tables are what keeps a
 * call working when the model is slow or unavailable, and what turns the
 * model's words ("day after tomorrow 5pm", "1.5 lakh") into exact values.
 *
 * Covers Hindi, Telugu, Tamil, Malayalam, Marathi and Gujarati, in native
 * script and in English letters ("kal subah 11 baje", "repu 10 gantalaki").
 */

// ── Script helpers ──────────────────────────────────────────────────────────

// \b only knows ASCII word characters, so Indic words need explicit edges.
export const L = '(?<![\\p{L}\\p{M}\\p{N}])';
export const R = '(?![\\p{L}\\p{M}\\p{N}])';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const alt = (words) => words.slice().sort((a, b) => b.length - a.length).map(esc).join('|');
export const wordRx = (words, flags = '') => new RegExp(`${L}(?:${alt(words)})${R}`, `iu${flags}`);

const DIGIT_ZEROS = [0x0966, 0x0ae6, 0x0c66, 0x0be6, 0x0d66]; // Devanagari, Gujarati, Telugu, Tamil, Malayalam

/** Native digits → ASCII ("११" → "11") and Indian digit grouping ("2,50,000" → "250000"). */
export function normalizeDigits(text) {
  return String(text ?? '')
    .replace(/[०-९૦-૯౦-౯௦-௯൦-൯]/g, ch => {
      const c = ch.charCodeAt(0);
      const zero = DIGIT_ZEROS.find(z => c >= z && c <= z + 9);
      return String(c - zero);
    })
    .replace(/(\d),(?=\d)/g, '$1');
}

export const hasIndicScript = (text) => /[ऀ-෿]/.test(String(text ?? ''));

// ── Numbers ─────────────────────────────────────────────────────────────────

export const NUMBER_WORDS = {
  // English
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
  // Hindi
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, chhah: 6, chah: 6, saat: 7, aath: 8, nau: 9,
  das: 10, dus: 10, gyarah: 11, gyara: 11, barah: 12, baarah: 12, terah: 13, chaudah: 14, pandrah: 15, solah: 16,
  satrah: 17, atharah: 18, unnis: 19, unnees: 19, bees: 20, pachees: 25, pachchis: 25, tees: 30, chalis: 40, chaalis: 40,
  pachaas: 50, pachas: 50, sau: 100,
  // Telugu
  okati: 1, okka: 1, rendu: 2, moodu: 3, mudu: 3, naalugu: 4, nalugu: 4, aidu: 5, aydu: 5, aaru: 6, edu: 7, yedu: 7,
  enimidi: 8, tommidi: 9, padi: 10, iravai: 20, muppai: 30, yabhai: 50, vanda: 100, vandha: 100,
  // Tamil
  onnu: 1, ondru: 1, irandu: 2, moonu: 3, moondru: 3, naalu: 4, anju: 5, ainthu: 5, ezhu: 7, ettu: 8, onbathu: 9,
  pathu: 10, irupathu: 20, mupathu: 30, aimbathu: 50, ambathu: 50, nooru: 100,
  // Malayalam
  randu: 2, moonnu: 3, ombathu: 9, iruvathu: 20, anpathu: 50,
  // Marathi
  don: 2, paach: 5, saha: 6, daha: 10, vees: 20, pannas: 50, shambhar: 100,
  // Gujarati
  be: 2, tran: 3, chha: 6, nav: 9, so: 100,
  // Native script
  'एक': 1, 'दो': 2, 'दोन': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5, 'पाच': 5, 'छह': 6, 'छः': 6, 'सहा': 6, 'सात': 7,
  'आठ': 8, 'नौ': 9, 'नऊ': 9, 'दस': 10, 'दहा': 10, 'ग्यारह': 11, 'बारह': 12, 'बीस': 20, 'वीस': 20, 'पचास': 50, 'पन्नास': 50,
  'सौ': 100, 'शंभर': 100,
  'ఒకటి': 1, 'రెండు': 2, 'మూడు': 3, 'నాలుగు': 4, 'ఐదు': 5, 'ఆరు': 6, 'ఏడు': 7, 'ఎనిమిది': 8, 'తొమ్మిది': 9, 'పది': 10,
  'ఇరవై': 20, 'యాభై': 50, 'వంద': 100,
  'ஒன்று': 1, 'ஒண்ணு': 1, 'இரண்டு': 2, 'ரெண்டு': 2, 'மூன்று': 3, 'மூணு': 3, 'நான்கு': 4, 'நாலு': 4, 'ஐந்து': 5,
  'அஞ்சு': 5, 'ஆறு': 6, 'ஏழு': 7, 'எட்டு': 8, 'ஒன்பது': 9, 'பத்து': 10, 'இருபது': 20, 'ஐம்பது': 50, 'நூறு': 100,
  'ഒന്ന്': 1, 'രണ്ട്': 2, 'മൂന്ന്': 3, 'നാല്': 4, 'അഞ്ച്': 5, 'ആറ്': 6, 'ഏഴ്': 7, 'എട്ട്': 8, 'ഒമ്പത്': 9, 'പത്ത്': 10,
  'ഇരുപത്': 20, 'അമ്പത്': 50, 'നൂറ്': 100,
  'એક': 1, 'બે': 2, 'ત્રણ': 3, 'ચાર': 4, 'પાંચ': 5, 'છ': 6, 'સાત': 7, 'આઠ': 8, 'નવ': 9, 'દસ': 10, 'વીસ': 20, 'પચાસ': 50, 'સો': 100
};

// Words that are also everyday English ("do you have…", "so", "teen") only count
// as numbers when the utterance isn't English.
export const AMBIGUOUS_NUMBER_WORDS = new Set(['do', 'be', 'so', 'teen', 'char', 'nav', 'edu', 'don', 'das']);

const FRACTIONS = { dedh: 1.5, derh: 1.5, dhai: 2.5, dhaai: 2.5, adhai: 2.5, adhaai: 2.5, dodh: 1.5, 'डेढ़': 1.5, 'डेढ': 1.5, 'ढाई': 2.5, 'दीड': 1.5, 'अडीच': 2.5, 'દોઢ': 1.5, 'અઢી': 2.5 };
const PREFIX = { saade: 0.5, sade: 0.5, saadhe: 0.5, sadhe: 0.5, sada: 0.5, sawa: 0.25, sava: 0.25, paune: -0.25, pone: -0.25, 'साढ़े': 0.5, 'साढे': 0.5, 'साडे': 0.5, 'सवा': 0.25, 'पौने': -0.25, 'સાડા': 0.5, 'સવા': 0.25, 'પોણા': -0.25 };
const MULTIPLIERS = {
  lakh: 1e5, lac: 1e5, lakhs: 1e5, laakh: 1e5, lacs: 1e5, 'लाख': 1e5, 'లక్ష': 1e5, 'లక్షలు': 1e5, 'லட்சம்': 1e5, 'ലക്ഷം': 1e5, 'લાખ': 1e5,
  crore: 1e7, crores: 1e7, cr: 1e7, karod: 1e7, karor: 1e7, 'करोड़': 1e7, 'करोड': 1e7, 'కోట్లు': 1e7, 'కోటి': 1e7, 'கோடி': 1e7, 'കോടി': 1e7, 'કરોડ': 1e7,
  hazaar: 1e3, hazar: 1e3, hajar: 1e3, thousand: 1e3, k: 1e3, 'हज़ार': 1e3, 'हजार': 1e3, 'వేలు': 1e3, 'వెయ్యి': 1e3, 'ஆயிரம்': 1e3, 'ആയിരം': 1e3, 'હજાર': 1e3,
  dozen: 12, darjan: 12, 'दर्जन': 12
};

const NUM_RX = new RegExp(
  `${L}(?:(${alt(Object.keys(PREFIX))})\\s+)?(\\d+(?:\\.\\d+)?|${alt(Object.keys(FRACTIONS))}|${alt(Object.keys(NUMBER_WORDS))})${R}(?:\\s*(${alt(Object.keys(MULTIPLIERS))})${R})?`,
  'giu'
);

/**
 * First number in an utterance, Indian style: "dedh lakh" → 150000, "saade gyarah" → 11.5,
 * "ek dozen" → 12, "₹2,50,000" → 250000, "పది" → 10.
 * @param {boolean} opts.allowAmbiguous accept English look-alikes ("do", "be") as numbers
 */
export function parseIndianNumber(text, { allowAmbiguous = false } = {}) {
  const t = normalizeDigits(text).toLowerCase();
  for (const m of t.matchAll(NUM_RX)) {
    const [raw, prefix, core, mult] = m;
    if (!allowAmbiguous && !prefix && !mult && AMBIGUOUS_NUMBER_WORDS.has(core)) continue;
    let n = /^\d/.test(core) ? Number(core) : FRACTIONS[core] ?? NUMBER_WORDS[core];
    if (n == null) continue;
    if (prefix) n += PREFIX[prefix] < 0 ? -0.25 : PREFIX[prefix];
    if (mult) n *= MULTIPLIERS[mult];
    return { value: Math.round(n * 100) / 100, raw: raw.trim(), hasMultiplier: !!mult };
  }
  return null;
}

/** Hour + minutes from "saade das", "sawa 4", "paune 11", "10" (no am/pm). */
export function parseClock(prefix, core) {
  let h = /^\d/.test(core) ? Number(core) : NUMBER_WORDS[core] ?? FRACTIONS[core];
  if (h == null) return null;
  let m = 0;
  if (!Number.isInteger(h)) { m = Math.round((h % 1) * 60); h = Math.floor(h); }
  const p = prefix ? PREFIX[prefix.toLowerCase()] : 0;
  if (p === 0.5) m = 30;
  else if (p === 0.25) m = 15;
  else if (p === -0.25) { h -= 1; m = 45; }
  if (h < 0 || h > 23) return null;
  return { h, m };
}

// "I need X" in Indian languages: "dus chahiye", "padi kavali", "moonu fan venum"
export const WANT_WORDS = ['chahiye', 'chaiye', 'chahie', 'chahiye tha', 'dijiye', 'de dijiye', 'dena', 'kavali', 'kaavali', 'kaavaali', 'kavalandi', 'venum', 'vendum', 'venam', 'veenam', 'pahije', 'pahijet', 'pahijel', 'joie', 'joiye', 'joiee', 'podhum', 'podum', 'mathi', 'chalega',
  'चाहिए', 'चाहिये', 'दीजिए', 'పాహిజే', 'కావాలి', 'వేణుం', 'வேணும்', 'வேண்டும்', 'வேணும', 'വേണം', 'पाहिजे', 'पाहिजेत', 'જોઈએ', 'જોઇએ'];

// ── Dates and times ─────────────────────────────────────────────────────────

export const DAY_WORDS = {
  dayAfter: ['day after tomorrow', 'parso', 'parson', 'parsoon', 'ellundi', 'ellundhi', 'naalai marunaal', 'nalai marunal', 'naalaikku marunaal', 'mattannaal', 'mattannal', 'parva', 'parmdivse', 'parmdivas', 'pasado mañana', 'pasado manana',
    'परसों', 'परसो', 'ఎల్లుండి', 'நாளை மறுநாள்', 'நாளை மறுநாள', 'മറ്റന്നാൾ', 'परवा', 'પરમદિવસે', 'પરમ દિવસે'],
  tomorrow: ['tomorrow', 'tmrw', 'kal', 'kall', 'repu', 'reypu', 'naalai', 'naalaikku', 'naalaiku', 'nalaiku', 'nalaikku', 'nalai', 'naale', 'nale', 'udya', 'udyaa', 'kaale', 'kale', 'aavti kaale', 'mañana', 'manana',
    'कल', 'రేపు', 'நாளை', 'நாளைக்கு', 'നാളെ', 'उद्या', 'કાલે', 'આવતીકાલે'],
  today: ['today', 'aaj', 'ivvala', 'ivala', 'eeroju', 'ee roju', 'indru', 'innaikku', 'inniki', 'innaiku', 'innu', 'aaje', 'hoy', 'same day', 'this day',
    'आज', 'ఈరోజు', 'ఇవాళ', 'ఈ రోజు', 'இன்று', 'இன்னைக்கு', 'ഇന്ന്', 'આજે']
};

export const PERIOD_WORDS = {
  morning: ['morning', 'subah', 'subha', 'savere', 'savera', 'sakali', 'sakaali', 'savare', 'udayam', 'podduna', 'kaalai', 'kaalaila', 'kalai', 'kaalaile', 'raavile', 'ravile', 'de la mañana', 'por la mañana',
    'सुबह', 'सवेरे', 'सकाळी', 'સવારે', 'ఉదయం', 'పొద్దున', 'పొద్దున్న', 'காலை', 'காலையில்', 'രാവിലെ'],
  afternoon: ['afternoon', 'noon', 'dopahar', 'dopehar', 'dupahar', 'dupari', 'bapore', 'madhyahnam', 'madhyanam', 'madhiyam', 'mathiyam', 'uchakku', 'uchaykku', 'de la tarde', 'por la tarde',
    'दोपहर', 'दुपारी', 'બપોરે', 'మధ్యాహ్నం', 'மதியம்', 'ഉച്ചയ്ക്ക്'],
  evening: ['evening', 'shaam', 'sham', 'shyam', 'sandhyakali', 'saanje', 'sanje', 'saayantram', 'sayantram', 'saayankalam', 'saayangaalam', 'sayangalam', 'maalai', 'vaikunneram', 'vaikittu',
    'शाम', 'संध्याकाळी', 'સાંજે', 'సాయంత్రం', 'மாலை', 'சாயங்காலம்', 'வைகுன்னேரம்', 'വൈകുന്നേരം', 'വൈകിട്ട്'],
  night: ['night', 'tonight', 'raat', 'raath', 'ratri', 'raatri', 'rathri', 'ratre', 'iravu', 'de la noche', 'por la noche',
    'रात', 'रात्री', 'રાત્રે', 'రాత్రి', 'இரவு', 'രാത്രി']
};

export const HOUR_MARKERS = ["o'clock", 'oclock', 'o clock', 'baje', 'bajey', 'bje', 'baj', 'bajkar', 'gantalaki', 'gantalaku', 'gantalu', 'gantaki', 'gantaku', 'ganta', 'manikku', 'manike', 'mani', 'vajta', 'vajata', 'vaajta', 'vaajata', 'vage', 'vagye', 'vaagye', 'vaage',
  'बजे', 'वाजता', 'વાગ્યે', 'વાગે', 'గంటలకు', 'గంటలకి', 'గంటకు', 'మణిక్కు', 'மணிக்கு', 'மணி', 'മണിക്ക്', 'മണി'];

export const CLOCK_PREFIXES = Object.keys(PREFIX);
export const CLOCK_WORDS = [...Object.keys(NUMBER_WORDS).filter(w => NUMBER_WORDS[w] >= 1 && NUMBER_WORDS[w] <= 12), ...Object.keys(FRACTIONS)];

export const WEEKDAY_WORDS = [
  ['sunday', 'ravivar', 'raviwar', 'ravivaar', 'itvaar', 'itwar', 'aadivaram', 'adivaram', 'gnayiru', 'nyayiru', 'njayar', 'njayarazhcha', 'रविवार', 'इतवार', 'ఆదివారం', 'ஞாயிறு', 'ഞായർ', 'ഞായറാഴ്ച', 'રવિવાર'],
  ['monday', 'somvar', 'somwar', 'somavaram', 'thingal', 'thinkal', 'सोमवार', 'సోమవారం', 'திங்கள்', 'തിങ്കൾ', 'સોમવાર'],
  ['tuesday', 'mangalvar', 'mangalwar', 'mangalavaram', 'sevvai', 'chovva', 'मंगलवार', 'మంగళవారం', 'செவ்வாய்', 'ചൊവ്വ', 'મંગળવાર'],
  ['wednesday', 'budhvar', 'budhwar', 'budhavaram', 'budhan', 'बुधवार', 'బుధవారం', 'புதன்', 'ബുധൻ', 'બુધવાર'],
  ['thursday', 'guruvar', 'guruwar', 'guruvaram', 'brihaspativar', 'viyazhan', 'vyazham', 'गुरुवार', 'గురువారం', 'வியாழன்', 'വ്യാഴം', 'ગુરુવાર'],
  ['friday', 'shukravar', 'shukrawar', 'sukravaram', 'shukravaram', 'velli', 'vellikizhamai', 'शुक्रवार', 'శుక్రవారం', 'வெள்ளி', 'വെള്ളി', 'શુક્રવાર'],
  ['saturday', 'shanivar', 'shaniwar', 'shanivaram', 'sanivaram', 'sani', 'shani', 'शनिवार', 'శనివారం', 'சனி', 'ശനി', 'શનિવાર']
];

export const ASAP_WORDS = ['asap', 'as soon as possible', 'right away', 'right now', 'immediately', 'urgently', 'turant', 'jaldi se jaldi', 'abhi ke abhi', 'ippude', 'ippove', 'udane', 'lagech', 'tarat', 'तुरंत', 'अभी के अभी', 'ఇప్పుడే', 'உடனே', 'ഉടനെ', 'लगेच', 'તરત'];

// ── Yes / no / fillers ──────────────────────────────────────────────────────

export const YES_WORDS = ['yes', 'yeah', 'yep', 'yup', 'ya', 'yah', 'sure', 'correct', 'right', "that's right", 'thats right', 'exactly', 'absolutely', 'definitely', 'of course', 'please do', 'go ahead', 'ok', 'okay', 'okk', 'done', 'affirmative', 'perfect', 'fine',
  // Hindi
  'haan', 'haa', 'han', 'ha', 'hanji', 'haanji', 'ji', 'jee', 'ji haan', 'theek hai', 'thik hai', 'theek', 'thik', 'sahi', 'sahi hai', 'bilkul', 'chalega', 'ho jayega', 'kar do', 'kar dijiye', 'pakka',
  // Telugu
  'avunu', 'avnu', 'aunu', 'avunandi', 'sare', 'sarey', 'saree', 'sari andi', 'ok andi', 'correct andi', 'cheyyandi',
  // Tamil
  'aamaa', 'aama', 'aamam', 'amam', 'sari', 'seri', 'sariyaana',
  // Malayalam
  'athe', 'athey', 'sheri', 'shari', 'uvvu', 'aanu',
  // Marathi
  'ho', 'hoy', 'barobar', 'chalel',
  // Gujarati
  'barabar', 'haa barabar', 'chalse',
  // Spanish
  'sí', 'si', 'claro', 'correcto', 'vale', 'de acuerdo',
  // Native script
  'हाँ', 'हां', 'हा', 'जी', 'जी हाँ', 'ठीक है', 'सही', 'सही है', 'बिल्कुल', 'चलेगा', 'होय', 'हो', 'बरोबर',
  'అవును', 'అవునండి', 'సరే', 'సరేనండి', 'ఓకే',
  'ஆமா', 'ஆமாம்', 'சரி', 'சரிங்க',
  'അതെ', 'ശരി', 'ഉവ്വ്', 'ശരിയാണ്',
  'હા', 'હાં', 'બરાબર', 'ચાલશે'];

export const NO_WORDS = ['no', 'nope', 'nah', 'not really', 'incorrect', 'wrong', "that's wrong", 'thats wrong', 'negative', "don't", 'do not', 'not',
  'nahi', 'nahin', 'nai', 'na', 'naa', 'galat', 'mat',
  'ledu', 'ledhu', 'kaadu', 'kadu', 'vaddu', 'vadhu', 'tappu',
  'illa', 'illai', 'venda', 'vendaam', 'vendam', 'thappu',
  'alla', 'vendaa',
  'nako', 'nahi', 'chukicha', 'chuk',
  'nathi', 'khotu', 'khotu che',
  'नहीं', 'नही', 'ना', 'गलत', 'मत', 'नको', 'नाही', 'चुकीचे',
  'లేదు', 'కాదు', 'వద్దు', 'తప్పు',
  'இல்ல', 'இல்லை', 'வேண்டாம்', 'வேணாம்', 'தப்பு',
  'ഇല്ല', 'അല്ല', 'വേണ്ട', 'തെറ്റ്',
  'નહીં', 'ના', 'ખોટું', 'નથી'];

const FILLERS = ['hmm', 'hmmm', 'hm', 'mm', 'mmm', 'umm', 'um', 'uh', 'ah', 'oh', 'achha', 'acha', 'accha', 'arey', 'arre', 'are', 'well', 'so', 'haan to', 'अच्छा', 'अरे', 'హా', 'ఆ'];
const FILLER_RX = new RegExp(`^(?:(?:${alt(FILLERS)})${R}[\\s,.!-]*)+`, 'iu');
export const stripFillers = (text) => String(text ?? '').trim().replace(FILLER_RX, '').trim();

const YES_RX = new RegExp(`^(?:${alt(YES_WORDS)})${R}`, 'iu');
const NO_RX = new RegExp(`^(?:${alt(NO_WORDS)})${R}`, 'iu');

/** Yes/no in any supported language: true, false or null. */
export function yesNo(text) {
  const t = stripFillers(text).toLowerCase().replace(/^[\s,.!¡¿-]+/, '');
  if (!t) return /^(hmm+|mm+|haan|ha)$/i.test(String(text).trim()) ? true : null;
  // Respectful endings ride on the word: "illai-nga", "sari-nga", "ledu-andi", "illai-ங்க"
  for (const v of [t, t.replace(POLITE_SUFFIX, '$1')]) {
    if (NO_RX.test(v)) return false;
    if (YES_RX.test(v)) return true;
  }
  return null;
}
const POLITE_SUFFIX = /^(\S+?)(?:nga|ngo|ngal|andi|ndi|gaaru|ji|ங்க|ண்டி|ండి|గారు|ജി)(?=$|[\s,.!?])/u;

// "haan", "hmm", "ok", "achha", "ji" said while Vexa is talking: listening, not a turn.
const BACKCHANNEL = ['hmm', 'hmmm', 'hm', 'mm', 'mmm', 'mhm', 'uh huh', 'uh-huh', 'ah', 'oh', 'ok', 'okay', 'okk', 'right', 'yeah', 'yes', 'ya', 'haan', 'haa', 'han', 'ha', 'haanji', 'hanji', 'ji', 'ji haan', 'achha', 'acha', 'accha', 'theek', 'theek hai', 'thik hai',
  'sare', 'sari', 'seri', 'aamaa', 'aama', 'ho', 'athe', 'sheri', 'avunu', 'barabar', 'barobar',
  'हाँ', 'हां', 'जी', 'अच्छा', 'ठीक है', 'హా', 'ఆ', 'సరే', 'ஆமா', 'சரி', 'ശരി', 'હા'];
const BACKCHANNEL_RX = new RegExp(`^(?:(?:${alt(BACKCHANNEL)})${R}[\\s,.!?-]*){1,4}$`, 'iu');
export const isBackchannel = (text) => BACKCHANNEL_RX.test(String(text ?? '').trim());

// ── Names ───────────────────────────────────────────────────────────────────

// "mera naam Ravi hai", "na peru Suresh", "en peru Karthik", "ente peru Anu", "maza naav Sachin aahe",
// "maru naam Hetal che", "my good name is…", "this side Lakshmi", "myself Priya"
export const NAME_INTRO_INDIC = /\b(?:naam hai|name hai|mera naam|mera name|meraa naam|naa peru|na peru|naa paeru|en peru|en paer|enoda peru|ente peru|ende peru|maza naav|majha naav|maaza naav|maru naam|maaru naam|mo naam|my good name is|my good name|this side|myself)\s+([A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+)?)/i;
export const NAME_TRAILING = /\s+(hai|hain|hoon|hu|aahe|ahe|che|chhe|andi|ji|bol|speaking|here|garu|sir|madam)$/i;
export const MAIN_SPEAKING = /\b(?:main|mai|me|nenu|naan|njan|mi)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:bol\s+rah[aie]|bol\s+raha|matladutunna|pesuren|pesaren|samsarikkunnu|boltoy|boltey|bolu)/;

// ── Phone numbers ───────────────────────────────────────────────────────────

const DIGIT_WORDS = { zero: '0', oh: '0', o: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  shunya: '0', ek: '1', do: '2', teen: '3', char: '4', chaar: '4', paanch: '5', chhe: '6', saat: '7', aath: '8', nau: '9' };
const REPEAT = { double: 2, triple: 3 };

/** Spoken digits → digit string: "double nine four eight triple five" → "994 8555". Keeps other text. */
export function spokenDigits(text) {
  const toks = normalizeDigits(text).toLowerCase().replace(/[-–]/g, ' ').split(/\s+/);
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i].replace(/[^\w+]/g, '');
    if (REPEAT[w] && i + 1 < toks.length) {
      const next = toks[i + 1].replace(/[^\w]/g, '');
      const d = DIGIT_WORDS[next] ?? (/^\d$/.test(next) ? next : null);
      if (d != null) { out.push(d.repeat(REPEAT[w])); i++; continue; }
    }
    if (w === 'plus') { out.push('+'); continue; }
    out.push(DIGIT_WORDS[w] ?? toks[i]);
  }
  // Join runs of digit tokens so "98490 01234" and "9 8 4 9…" become one number
  return out.join(' ').replace(/(?<=[\d+])\s+(?=\d)/g, '');
}
