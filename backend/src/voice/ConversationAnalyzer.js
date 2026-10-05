/**
 * ConversationAnalyzer
 *
 * Post-call analysis using OpenAI Chat (Azure or api.openai.com).
 * Classifies calls into the owner's configured categories, extracts caller
 * details and — for business accounts — captures leads.
 *
 * Falls back to keyword matching if the API is unavailable.
 */

import { structuredJson, llmLabel } from '../lib/llm.js';
import { nullableString, strictObject } from '../lib/claude.js';

const nullableBool = { anyOf: [{ type: 'boolean' }, { type: 'null' }] };
const ANALYSIS_SCHEMA = strictObject({
  categoryId: { type: 'string' },
  categoryLabel: { type: 'string' },
  confidence: { type: 'number' },
  summary: { type: 'string' },
  sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
  callerName: nullableString,
  organization: nullableString,
  topic: nullableString,
  actionTaken: nullableString,
  urgency: { type: 'string', enum: ['low', 'normal', 'high', 'critical'] },
  actionRequired: { type: 'boolean' },
  actionItems: { type: 'array', items: { type: 'string' } },
  isSpam: { type: 'boolean' },
  lead: strictObject({
    isLead: { type: 'boolean' },
    name: nullableString,
    callbackNumber: nullableString,
    need: nullableString,
    preferredTime: nullableString,
    value: { anyOf: [{ type: 'string', enum: ['low', 'medium', 'high'] }, { type: 'null' }] }
  })
});
void nullableBool;

const SPAM_CATEGORY = /^(spam|business\.sales)/;
// Intro phrase is case-insensitive; the name itself must be Capitalised
export const NAME_INTRO = /(?:\b[Ii](?:'?m| am)|\b[Tt]his is|\b[Mm]y name is|\b[Nn]ame'?s)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/;

class ConversationAnalyzer {
  constructor(config = process.env) {
    this.config = config;
    // `new ConversationAnalyzer({})` is the keyword-only quick detector; pass process.env for AI analysis
    this.useLocal = !config.ANTHROPIC_API_KEY && !config.OPENAI_API_KEY;
    if (config === process.env) console.log(`✅ ConversationAnalyzer: ${this.useLocal ? 'local keyword fallback' : llmLabel()}`);
  }

  /**
   * @param {Array}  transcripts [{speaker, text, timestamp}]
   * @param {Object} context     { categories, accountType }
   */
  async analyze(transcripts, context = {}) {
    const lines = (transcripts || []).filter(t => t.speaker !== 'system' && t.text?.trim());
    if (lines.length === 0) return this._empty();

    const categories = context.categories || [];
    if (this.useLocal) return this._fallback(lines, categories);

    try {
      return await this._callAPI(lines, categories, context);
    } catch (err) {
      console.error('❌ ConversationAnalyzer API error:', err.message);
      return this._fallback(lines, categories);
    }
  }

  /**
   * Quick keyword-based category detection.
   * Scores every category by the total length of whole-word keyword matches,
   * so specific phrases ("marketing services", "seo") beat generic ones
   * ("services"). Ties go to the higher-priority (lower number) category.
   */
  detectCategoryQuick(text, categories = []) {
    const lower = ` ${(text || '').toLowerCase().replace(/[^a-z0-9\u0900-\u097F' ]+/g, ' ')} `;
    let best = null;
    for (const cat of categories) {
      let score = 0;
      for (const kw of cat.keywords || []) {
        const k = String(kw || '').toLowerCase().trim();
        if (k && lower.includes(` ${k} `)) score += k.length;
      }
      if (score > 0 && (!best || score > best.score || (score === best.score && (cat.priority || 5) < (best.cat.priority || 5)))) {
        best = { cat, score };
      }
    }
    return best ? { categoryId: best.cat.id, categoryLabel: best.cat.label, confidence: 0.7 } : null;
  }

  async _callAPI(transcripts, categories, context) {
    const conversation = transcripts
      .map(t => `${t.speaker === 'user' || t.speaker === 'caller' ? 'CALLER' : 'AI'}: ${t.text}`)
      .join('\n');

    const categoryList = categories.length > 0
      ? categories.map(c => `  - ${c.id}: ${c.label} (keywords: ${(c.keywords || []).join(', ')})`).join('\n')
      : '  (no categories defined — use "personal.unknown")';

    const isBusiness = context.accountType !== 'personal';

    const systemPrompt = `You analyze phone call transcripts for an AI receptionist / call screening product${isBusiness ? ' used by a small business' : ''}.

Classify the call into one of the owner's configured categories and extract key information.

CONFIGURED CATEGORIES:
${categoryList}

CALLER NAME: scan the whole transcript for the caller's name ("I'm Rahul", "This is Priya", "Deepa here", or the AI saying "Thanks, Sam"). Use null only if never mentioned.

LEAD: a lead is a caller who is a potential or existing customer wanting something the business should respond to (a quote, booking, purchase, service, follow-up). Spam, sales pitches, wrong numbers and robocalls are never leads.

Return a JSON object with EXACTLY these fields:
{
  "categoryId": "<id from categories above, or 'personal.unknown' if none match>",
  "categoryLabel": "<human label>",
  "confidence": <0.0 to 1.0>,
  "summary": "<1-2 sentence summary written for the owner>",
  "sentiment": "<positive|neutral|negative>",
  "callerName": "<name or null>",
  "organization": "<company/service or null>",
  "topic": "<what the call was about, brief>",
  "actionTaken": "<what the AI did>",
  "urgency": "<low|normal|high|critical>",
  "actionRequired": <true if the owner needs to do something>,
  "actionItems": ["<concrete next step for the owner>"],
  "isSpam": <true for spam, robocalls, unsolicited sales>,
  "lead": {
    "isLead": <true|false>,
    "name": "<name or null>",
    "callbackNumber": "<number if the caller gave a different one, else null>",
    "need": "<what they want, one line, or null>",
    "preferredTime": "<when they want a callback/appointment, or null>",
    "value": "<low|medium|high or null>"
  }
}

Return ONLY valid JSON.`;

    const raw = await structuredJson({
      system: systemPrompt,
      user: `Analyze this call:\n\n${conversation}`,
      schema: ANALYSIS_SCHEMA,
      effort: 'low',
      maxTokens: 4096,
      timeoutMs: 30000
    });

    const known = categories.find(c => c.id === raw.categoryId);

    return {
      categoryId: raw.categoryId || 'personal.unknown',
      categoryLabel: known?.label || raw.categoryLabel || 'Unknown',
      confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.5,
      summary: raw.summary || '',
      sentiment: raw.sentiment || 'neutral',
      callerName: raw.callerName || null,
      organization: raw.organization || null,
      topic: raw.topic || null,
      actionTaken: raw.actionTaken || null,
      urgency: raw.urgency || 'normal',
      actionRequired: !!raw.actionRequired,
      actionItems: Array.isArray(raw.actionItems) ? raw.actionItems : [],
      isSpam: !!raw.isSpam || SPAM_CATEGORY.test(raw.categoryId || ''),
      lead: raw.lead && typeof raw.lead === 'object' ? { ...raw.lead, isLead: !!raw.lead.isLead && !raw.isSpam } : { isLead: false }
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Fallback (keyword matching)
  // ─────────────────────────────────────────────────────────────────────────

  _fallback(transcripts, categories) {
    const callerLines = transcripts.filter(t => t.speaker === 'user' || t.speaker === 'caller').map(t => t.text);
    const callerText = callerLines.join(' ');
    const matched = this.detectCategoryQuick(callerText, categories);
    const matchedCat = matched ? categories.find(c => c.id === matched.categoryId) : null;

    const lower = callerText.toLowerCase();
    const sentiment = /thank|great|appreciate|perfect/.test(lower) ? 'positive'
      : /angry|frustrated|terrible|unacceptable|ridiculous/.test(lower) ? 'negative'
      : 'neutral';

    let callerName = null;
    for (const line of callerLines) {
      const match = line.match(NAME_INTRO);
      if (match && !/^(calling|looking|interested|just|not|from|here|the|a)$/i.test(match[1].split(' ')[0])) {
        callerName = match[1];
        break;
      }
      const match2 = line.match(/^([A-Z][a-z]+)(?:\s+here|\s+from\s+\w+)[.,!?]?\s*$/);
      if (match2) { callerName = match2[1]; break; }
    }

    const categoryId = matched?.categoryId || 'personal.unknown';
    const isSpam = SPAM_CATEGORY.test(categoryId);
    const isUrgent = matchedCat?.action === 'connect_user' || /emergency|urgent|asap/.test(lower);
    const isLead = !isSpam && /^(customer|booking|orders|patient|tenant)\./.test(categoryId);
    const firstCallerLine = callerLines[0] || '';

    return {
      categoryId,
      categoryLabel: matched?.categoryLabel || 'Unknown',
      confidence: matched ? 0.5 : 0.2,
      summary: callerText
        ? `${callerName || 'Caller'}: "${callerText.slice(0, 140)}${callerText.length > 140 ? '…' : ''}"`
        : 'No caller speech captured.',
      sentiment,
      callerName,
      organization: null,
      topic: matched?.categoryLabel || null,
      actionTaken: matchedCat ? `Handled as ${matchedCat.label}` : null,
      urgency: isUrgent ? 'high' : 'normal',
      actionRequired: isLead || isUrgent,
      actionItems: isLead ? [`Call back ${callerName || 'the caller'}`] : [],
      isSpam,
      lead: { isLead, name: callerName, need: isLead ? firstCallerLine.slice(0, 160) : null },
      fallback: true
    };
  }

  _empty() {
    return {
      categoryId: 'no_conversation',
      categoryLabel: 'No Conversation',
      confidence: 1.0,
      summary: 'No conversation occurred.',
      sentiment: 'neutral',
      callerName: null,
      organization: null,
      topic: null,
      actionTaken: null,
      urgency: 'low',
      actionRequired: false,
      actionItems: [],
      isSpam: false,
      lead: { isLead: false }
    };
  }
}

export default ConversationAnalyzer;
