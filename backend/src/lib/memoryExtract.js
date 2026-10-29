/**
 * Offline fallback for call memories (used when no AI model is configured).
 * Finds promises the CALLER made ("I'll call you back on Monday", "kal tak bhej dunga")
 * and prices they quoted ("it will be ₹1,800", "1800 rupees lagega").
 * The model path (ConversationAnalyzer) does this better; this keeps the feature honest offline.
 */

import { extractDateTime } from '../workflows/extractors.js';

const PROMISE = /\b(i'?ll|i will|we'?ll|we will|i am going to|i'm going to|will)\s+(call|ring|send|come|deliver|visit|pay|transfer|get back|confirm|check|email|message|text|share|bring|drop)\b|\b(bhej dunga|bhej denge|call karunga|call karenge|aa jaunga|aa jayenge|de dunga|kar dunga|kar denge|pampistanu|chestanu|anupparen|varen)\b/i;
const MONEY = /(?:₹|rs\.?|inr)\s?(\d[\d,]*(?:\.\d+)?)|\b(\d[\d,]*(?:\.\d+)?)\s?(?:rupees|rs\b|\/-|lagega|hoga|avutundi|aagum)/i;
const QUOTE_HINT = /\b(cost|price|charge|charges|quote|total|lagega|hoga|rate|fees?|bill|estimate|avutundi|aagum)\b/i;

const clip = s => String(s).replace(/\s+/g, ' ').trim().slice(0, 200);

/**
 * @param lines [{ speaker, text }] English view of the call
 * @returns [{ kind, text, who, amount, due }]
 */
export function extractMemories(lines, { now = new Date(), callerName = null } = {}) {
  const out = [];
  for (const l of lines || []) {
    if (!(l.speaker === 'user' || l.speaker === 'caller') || !l.text) continue;
    const t = l.text;
    if (PROMISE.test(t)) {
      const when = extractDateTime(t, false, now);
      out.push({ kind: 'promise', text: clip(t), who: callerName, amount: null, due: when?.value?.iso || null });
    }
    const m = t.match(MONEY);
    if (m && QUOTE_HINT.test(t)) {
      const amount = Number(String(m[1] || m[2]).replace(/,/g, ''));
      if (amount > 0) out.push({ kind: 'quote', text: clip(t), who: callerName, amount, due: null });
    }
  }
  return out.slice(0, 6);
}
