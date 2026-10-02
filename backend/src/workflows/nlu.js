/**
 * Model-assisted understanding for one caller turn (optional).
 *
 * The engine decides WHAT to do; the model only reads the utterance and
 * returns structured facts. One small JSON call per turn with a hard
 * timeout — on any failure the engine's offline extractors take over, so a
 * slow model can never stall a live phone call.
 */

import { structuredJson, llmAvailable, llmProvider } from '../lib/llm.js';
import { strictObject } from '../lib/claude.js';
import { LANGUAGE_CODES, normalizeLanguage, detectLanguage } from '../lib/language.js';

// Phone calls can't wait long: on timeout the offline extractors answer instead.
const timeoutMs = () => Number(process.env.NLU_TIMEOUT_MS) || (llmProvider() === 'anthropic' ? 5000 : 3500);

export function nluAvailable() {
  return llmAvailable() && process.env.NLU_DISABLED !== 'true';
}


export async function understand(session, text, { timeout } = {}) {
  if (!nluAvailable()) return null;

  const active = session.active;
  const pending = (active?.slots || []).filter(s => !session.slots[s.key]).map(s => `${s.key} (${s.type}${s.options ? `: ${s.options.map(o => o.value).join('|')}` : ''}) — ${s.label}`);
  const flows = session.flows.map(f => `${f.id}: ${f.name} — ${f.description || ''}`).join('\n');
  const p = session.user.businessProfile || {};
  const knowledge = [
    p.description && `About: ${p.description}`,
    p.address && `Address: ${p.address}`,
    p.website && `Website: ${p.website}`,
    p.bookingUrl && `Booking link: ${p.bookingUrl}`,
    p.directions && `Directions: ${p.directions}`,
    p.hours?.length && `Opening hours (${p.timezone || 'local'}): ${p.hours.map(h => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][h.day]} ${h.closed ? 'closed' : `${h.open}-${h.close}`}`).join(', ')}`,
    p.services?.length && `Services: ${p.services.join('; ')}`,
    ...(p.faqs || []).map(f => `Q: ${f.question} A: ${f.answer}`)
  ].filter(Boolean).join('\n');

  const system = `You extract structured information from one caller utterance on a phone call handled by an AI receptionist.
${active ? `Current flow: ${active.id} (${active.name}). The receptionist just asked for: ${session.asked || 'nothing'}.` : `No flow chosen yet. Pick the best flow id for the caller's intent:\n${flows}`}
Facts still needed: ${pending.length ? pending.join('; ') : 'none'}.
${session.asked?.startsWith('confirm:') ? 'The receptionist just read back the details for confirmation. If the caller simply agrees, leave slots empty. If they change a detail, put ONLY the new value in that slot.' : ''}

Business knowledge (answer ONLY from this; if the answer is not here, answer is null):
${knowledge || '(none)'}

Return JSON:
{
  "intent": "<flow id, or empty string>",
  "slots": { "<slot key>": "<value as the caller said it, concise>" },
  "answer": "<a one-sentence answer if the caller asked a question answerable from the knowledge above, else empty string>",
  "wantsHuman": <true if they ask for a real person/owner>,
  "goodbye": <true if they are ending the call>,
  "emergency": <true if the caller describes something urgent or dangerous happening right now — flooding, fire, gas, injury, no heat in winter, a break-in — even without the word "emergency">,
  "language": "<the language of THIS utterance: ${LANGUAGE_CODES.join(' | ')} | other. Code-mixed speech counts as the non-English language it is mixed with>",
  "translation": "<the utterance translated into English (copy it if it is already English)>",
  "confirmation": "<'yes' or 'no' if the caller is agreeing or disagreeing with what was just read back to them, else empty>"
}
The caller may speak English, Hindi, Telugu, Tamil, Malayalam, Marathi, Gujarati or Spanish, and may switch between them.
ALWAYS write slot values and the answer in English: transliterate names into Latin script (రవి → Ravi), yes/no slots as "yes"/"no", quantities and rates as digits, times as English words ("tomorrow 11am").
Use an empty string for any slot the caller did not clearly state. Dates/times: keep the caller's words ("tomorrow at 3pm").`;

  // Schema lists exactly the facts we can use this turn. Plain strings ("" = not stated)
  // keep it within structured-output limits on union-typed fields.
  // While confirming, the caller may correct a detail ("actually, the week after"), so the
  // correctable slots are offered too.
  const confirming = session.asked?.startsWith('confirm:') ? active?.steps?.[session.pointer] : null;
  const correctable = new Set(confirming?.recollect || []);
  const slotKeys = [...new Set((active ? active.slots.filter(sl => !session.slots[sl.key] || correctable.has(sl.key)) : session.flows.flatMap(f => f.slots || [])).map(sl => sl.key))];
  const schema = strictObject({
    intent: { type: 'string', enum: ['', ...session.flows.map(f => f.id)] },
    slots: strictObject(Object.fromEntries(slotKeys.map(k => [k, { type: 'string' }]))),
    answer: { type: 'string' },
    wantsHuman: { type: 'boolean' },
    goodbye: { type: 'boolean' },
    emergency: { type: 'boolean' },
    language: { type: 'string', enum: [...LANGUAGE_CODES, 'other'] },
    translation: { type: 'string' },
    confirmation: { type: 'string', enum: ['yes', 'no', ''] }
  });

  try {
    const raw = await Promise.race([
      structuredJson({ system, user: text, schema, effort: 'low', maxTokens: 2048, timeoutMs: timeout || timeoutMs(), purposeModel: 'fast' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('NLU timeout')), timeout || timeoutMs()))
    ]);
    const validKeys = new Set((active?.slots || session.flows.flatMap(f => f.slots || [])).map(s => s.key));
    const slots = Object.fromEntries(Object.entries(raw.slots || {}).filter(([k, v]) => validKeys.has(k) && v != null && v !== ''));
    const language = normalizeLanguage(raw.language) || detectLanguage(text);
    return {
      used: true,
      language,
      translation: typeof raw.translation === 'string' && raw.translation.trim() ? raw.translation.trim() : text,
      confirmation: raw.confirmation || '',
      intent: session.flows.some(f => f.id === raw.intent) ? raw.intent : null,
      slots,
      answer: typeof raw.answer === 'string' && raw.answer.trim() ? raw.answer.trim() : null,
      wantsHuman: !!raw.wantsHuman,
      goodbye: !!raw.goodbye,
      emergency: !!raw.emergency
    };
  } catch (err) {
    console.warn(`NLU fallback to offline extractors: ${err.message}`);
    return null;
  }
}
