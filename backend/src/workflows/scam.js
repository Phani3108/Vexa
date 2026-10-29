/**
 * Scam shield: spots the scripts of common phone frauds in any supported
 * language and in Indian languages typed in English letters.
 *
 * Each scam type needs TWO signals together (e.g. an authority claim AND an
 * arrest/parcel threat), so a real courier or a real bank callback doesn't trip
 * it. Asking for an OTP, PIN, CVV or a screen-sharing app is enough on its own:
 * no legitimate caller asks the owner's assistant for those.
 *
 * Fallback only: on calls, the model's per-turn `scam` label is checked first.
 */

import { L, R, alt } from '../lib/indic.js';

const rx = (words) => new RegExp(`${L}(?:${alt(words)})${R}`, 'iu');

const AUTHORITY = ['cbi', 'ed officer', 'enforcement directorate', 'ncb', 'narcotics', 'customs', 'police', 'cyber cell', 'cyber crime', 'crime branch', 'trai', 'rbi', 'income tax', 'mumbai police', 'delhi police', 'officer', 'inspector', 'court',
  'पुलिस', 'सीबीआई', 'कस्टम', 'नारकोटिक्स', 'अधिकारी', 'పోలీస్', 'సీబీఐ', 'పోలీసు', 'போலீஸ்', 'காவல்', 'പോലീസ്', 'पोलीस', 'પોલીસ'];
const THREAT = ['arrest', 'arrested', 'warrant', 'fir', 'case registered', 'money laundering', 'drugs', 'narcotics found', 'illegal', 'seized', 'digital arrest', 'video call', 'skype', 'investigation', 'jail', 'legal action', 'freeze', 'frozen',
  'giraftar', 'giraftaar', 'jail jaoge', 'case darj', 'गिरफ्तार', 'गिरफ्तारी', 'ड्रग्स', 'केस', 'जेल', 'అరెస్ట్', 'కేసు', 'జైలు', 'கைது', 'வழக்கு', 'അറസ്റ്റ്', 'अटक', 'ધરપકડ'];
const ACCOUNT = ['kyc', 'pan card', 'aadhaar', 'aadhar', 'bank account', 'account', 'sim', 'sim card', 'debit card', 'credit card', 'electricity', 'bijli', 'light bill', 'connection', 'number',
  'खाता', 'केवाईसी', 'आधार', 'सिम', 'बिजली', 'ఖాతా', 'ఆధార్', 'సిమ్', 'கணக்கு', 'ஆதார்', 'அக்கவுண்ட்'];
const BLOCKING = ['blocked', 'block', 'band', 'band ho', 'suspend', 'suspended', 'deactivate', 'deactivated', 'expire', 'expired', 'expiring', 'disconnect', 'disconnected', 'cut', 'kat jayega', 'kat jaayega', 'update now', 'verify now',
  'बंद', 'ब्लॉक', 'कट जाएगा', 'ఆగిపోతుంది', 'బ్లాక్', 'முடக்கப்படும்', 'ப்ளாக்'];
const PARCEL = ['parcel', 'package', 'courier', 'fedex', 'dhl', 'shipment', 'consignment', 'पार्सल', 'పార్సెల్', 'பார்சல்'];
const RELATIVE = ['your son', 'your daughter', 'your husband', 'your wife', 'your brother', 'beta', 'beti', 'bhai', 'papa', 'mummy', 'aapka beta', 'aapki beti', 'mee abbayi', 'mee ammayi', 'unga paiyan', 'उनका बेटा', 'आपका बेटा', 'आपकी बेटी'];
const TROUBLE = ['accident', 'hospital', 'arrested', 'police station', 'jail', 'stuck', 'in trouble', 'hurt', 'emergency', 'एक्सीडेंट', 'अस्पताल', 'हादसा', 'యాక్సిడెంట్', 'ఆసుపత్రి', 'விபத்து', 'மருத்துவமனை'];
// A request to SEND money (not a customer offering to pay): "send money", "paise bhejo", "gpay karo"
const MONEY = ['send money', 'send the money', 'send some money', 'transfer money', 'transfer the money', 'transfer the amount', 'send the amount', 'pay now',
  'gpay karo', 'gpay kar do', 'gpay kijiye', 'phonepe karo', 'phonepe kar do', 'paytm karo', 'paytm kar do', 'google pay karo', 'send on gpay', 'send on phonepe', 'send on paytm', 'send it on gpay', 'scan and pay',
  'paise bhejo', 'paise bhej do', 'paise bhejiye', 'paisa bhejo', 'paisa bhej do', 'paise transfer karo', 'paise dalo', 'paise daalo', 'money bhejo', 'dabbulu pampandi', 'dabbulu pampu', 'panam anuppunga',
  'पैसे भेजो', 'पैसे भेजिए', 'पैसे भेज दो', 'డబ్బులు పంపండి', 'డబ్బు పంపు', 'பணம் அனுப்புங்க', 'പണം അയക്കൂ'];
// What a fake prize "costs" to release
const FEES = ['processing fee', 'registration fee', 'release fee', 'tax', 'gst', 'charges', 'deposit', 'advance', 'fee'];
// The caller talks about the listener's account ("your KYC", "aapka SIM"), not their own
const YOUR = ['your', 'aapka', 'aapki', 'aapke', 'tumhara', 'tumhari', 'mee', 'meeru', 'mee yokka', 'unga', 'ungal', 'ungaloda', 'ningalude', 'tumcha', 'tamaru', 'आपका', 'आपकी', 'आपके', 'तुम्हारा', 'మీ', 'உங்க', 'உங்கள்', 'നിങ്ങളുടെ', 'तुमचा', 'તમારું'];
const PRIZE = ['lottery', 'prize', 'lucky draw', 'you have won', 'you won', 'kbc', 'kaun banega crorepati', 'jackpot', 'gift', 'cashback', 'reward', 'लॉटरी', 'इनाम', 'లాటరీ', 'பரிசு'];
const URGENT = ['today', 'tonight', 'right now', 'immediately', 'within', 'hours', '2 hours', 'aaj', 'aaj raat', 'abhi', 'turant', 'jaldi', 'आज', 'अभी', 'तुरंत', 'ఈరోజు', 'இன்று'];

// Asking for secrets is a scam on its own. An OTP for a delivery at the door is the one
// legitimate case: the delivery flow hands that caller to the owner instead.
const OTP = rx(['otp', 'one time password', 'o t p', 'ओटीपी', 'ఓటీపీ', 'ஓடிபி', 'ഒടിപി', 'ઓટીપી']);
const DELIVERY = rx(['delivery', 'deliver', 'delivering', 'delivery boy', 'delivery partner', 'amazon', 'flipkart', 'swiggy', 'zomato', 'blinkit', 'zepto', 'bigbasket', 'myntra', 'meesho', 'dunzo', 'instamart', 'order', 'parcel', 'package', 'at the gate', 'at your door', 'at the door', 'gate', 'डिलीवरी', 'డెలివరీ', 'டெலிவரி']);
const SECRET = rx(['otp', 'one time password', 'o t p', 'upi pin', 'atm pin', 'pin number', 'cvv', 'card number', 'card details', 'net banking password', 'password', 'mpin', 'anydesk', 'any desk', 'teamviewer', 'team viewer', 'quicksupport', 'screen share', 'share your screen', 'remote app',
  'ओटीपी', 'पिन', 'ఓటీపీ', 'ஓடிபி', 'ഒടിപി', 'ઓટીપી']);
const ASKING = rx(['share', 'tell', 'tell me', 'give', 'send', 'read', 'read out', 'say', 'batao', 'bataiye', 'bataye', 'bolo', 'boliye', 'bhejo', 'dijiye', 'do', 'cheppandi', 'cheppu', 'sollunga', 'sollu', 'parayu', 'sango', 'kaho', 'install', 'download', 'open',
  'बताओ', 'बताइए', 'बोलिए', 'भेजो', 'చెప్పండి', 'சொல்லுங்க', 'പറയൂ', 'सांगा', 'કહો']);

const GROUPS = [
  { type: 'digital_arrest', label: 'Fake police / CBI / "digital arrest"', all: [rx(AUTHORITY), rx(THREAT)] },
  { type: 'fake_courier', label: 'Fake courier or customs parcel', all: [rx(PARCEL), rx([...THREAT, 'customs', 'drugs', 'passport'])] },
  { type: 'kyc_block', label: 'Fake KYC / account or SIM blocking', all: [rx(ACCOUNT), rx(BLOCKING), rx(YOUR)] },
  { type: 'impostor_relative', label: 'Impostor relative asking for money', all: [rx([...RELATIVE, ...TROUBLE]), rx(MONEY)], any: [rx(RELATIVE), rx(URGENT)] },
  { type: 'prize', label: 'Fake prize or lottery', all: [rx(PRIZE), rx([...MONEY, ...FEES])] }
];

export const SCAM_LABELS = Object.fromEntries([...GROUPS.map(g => [g.type, g.label]), ['secret_request', 'Asked for an OTP, PIN or remote access'], ['other_scam', 'Likely scam']]);
export const SCAM_TYPES = Object.keys(SCAM_LABELS);

/** Requests for OTPs, PINs, card details or screen sharing. */
export function asksForSecret(text) {
  const t = String(text || '');
  if (!SECRET.test(t) || !ASKING.test(t)) return false;
  // "Delivery here, OTP bata dijiye" — only an OTP, at a delivery: not a scam
  const onlyOtp = !SECRET.test(t.replace(new RegExp(OTP.source, 'giu'), ' '));
  return !(onlyOtp && DELIVERY.test(t));
}

/**
 * @returns {{ type: string, label: string } | null}
 */
export function detectScam(text) {
  const t = String(text || '');
  if (!t.trim()) return null;
  for (const g of GROUPS) {
    if (g.all.every(re => re.test(t)) && (!g.any || g.any.some(re => re.test(t)))) return { type: g.type, label: g.label };
  }
  if (asksForSecret(t)) return { type: 'secret_request', label: SCAM_LABELS.secret_request };
  return null;
}
