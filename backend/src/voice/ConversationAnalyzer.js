/**
 * ConversationAnalyzer
 *
 * Post-call analysis using OpenAI Chat API.
 * Classifies calls into categories defined in UserConfig.callCategories
 * rather than a hard-coded intent list, so the analysis stays in sync
 * with whatever categories the user has configured.
 *
 * Falls back to keyword matching if the API is unavailable.
 */

import axios from 'axios';

class ConversationAnalyzer {
  constructor(config) {
    this.azureEndpoint = config.OPENAI_ENDPOINT;
    this.azureApiKey = config.OPENAI_API_KEY;
    this.deploymentName = config.OPENAI_CHAT_DEPLOYMENT;
    this.apiVersion = '2024-10-01-preview';
    this.useLocal = !this.deploymentName;

    console.log(`✅ ConversationAnalyzer initialized (${this.useLocal ? 'local fallback' : this.deploymentName})`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Main entry point
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Analyze a completed call transcript.
   *
   * @param {Array} transcripts  [{speaker, text, timestamp}]
   * @param {Object} context     { categories: UserConfig.callCategories }
   */
  async analyze(transcripts, context = {}) {
    if (!transcripts || transcripts.length === 0) {
      return this._empty();
    }

    if (this.useLocal) {
      return this._fallback(transcripts, context.categories || []);
    }

    try {
      return await this._callAPI(transcripts, context.categories || []);
    } catch (err) {
      console.error('❌ ConversationAnalyzer API error:', err.message);
      return this._fallback(transcripts, context.categories || []);
    }
  }

  /**
   * Quick keyword-based category detection during a live call.
   * Used to emit real-time category hints to the mobile app.
   *
   * @param {string} text        Latest transcript line
   * @param {Array}  categories  UserConfig.callCategories
   */
  detectCategoryQuick(text, categories = []) {
    const lower = text.toLowerCase();

    for (const cat of categories) {
      if (cat.keywords?.some(kw => lower.includes(kw.toLowerCase()))) {
        return { categoryId: cat.id, categoryLabel: cat.label, confidence: 0.7 };
      }
    }

    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // API analysis
  // ─────────────────────────────────────────────────────────────────────────

  async _callAPI(transcripts, categories) {
    const url = `${this.azureEndpoint}/openai/deployments/${this.deploymentName}/chat/completions?api-version=${this.apiVersion}`;

    const conversation = transcripts
      .map(t => `${t.speaker === 'user' || t.speaker === 'caller' ? 'CALLER' : 'AI'}: ${t.text}`)
      .join('\n');

    const categoryList = categories.length > 0
      ? categories.map(c => `  - ${c.id}: ${c.label} (keywords: ${(c.keywords || []).join(', ')})`).join('\n')
      : '  (no categories defined — use "personal.unknown")';

    const systemPrompt = `You are an expert at analyzing phone call transcripts for a smart call screening app.

Given the transcript and the user's configured call categories, classify the call and extract key information.

CONFIGURED CATEGORIES:
${categoryList}

IMPORTANT — CALLER NAME EXTRACTION:
Scan the entire transcript carefully for the caller's name. The AI assistant greets and asks "May I know who's calling?" — look for the caller's response. Names may appear as:
  - Direct answers: "I'm Rahul", "This is Priya", "My name is Amit Shah"
  - Implicit: "Hi, it's Ravi from Swiggy", "Yeah, Deepa here"
  - Mid-conversation: AI says "Thanks [Name]" or "Sure [Name], I'll pass that along"
Extract the caller's name even if mentioned only once. Set to null ONLY if the name was genuinely never mentioned.

Return a JSON object with EXACTLY these fields:
{
  "categoryId": "<id from categories above, or 'personal.unknown' if none match>",
  "categoryLabel": "<human label>",
  "confidence": <0.0 to 1.0>,
  "summary": "<1-2 sentence summary>",
  "sentiment": "<positive|neutral|negative>",
  "callerName": "<caller's full name or first name if only first name given, or null if never mentioned>",
  "organization": "<company/service or null>",
  "topic": "<what the call was about, brief>",
  "actionTaken": "<what the AI did, e.g. 'Told delivery to leave at door'>",
  "urgency": "<low|normal|high|critical>",
  "actionRequired": <true|false>,
  "actionItems": ["<item1>", "<item2>"]
}

Return ONLY valid JSON.`;

    const response = await axios.post(url, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analyze this call:\n\n${conversation}` }
      ],
      temperature: 0.2,
      max_tokens: 800,
      response_format: { type: 'json_object' }
    }, {
      headers: { 'Content-Type': 'application/json', 'api-key': this.azureApiKey },
      timeout: 30000
    });

    const raw = JSON.parse(response.data.choices[0].message.content);

    return {
      categoryId: raw.categoryId || 'personal.unknown',
      categoryLabel: raw.categoryLabel || 'Unknown',
      confidence: raw.confidence || 0.5,
      summary: raw.summary || '',
      sentiment: raw.sentiment || 'neutral',
      callerName: raw.callerName || null,
      organization: raw.organization || null,
      topic: raw.topic || null,
      actionTaken: raw.actionTaken || null,
      urgency: raw.urgency || 'normal',
      actionRequired: raw.actionRequired || false,
      actionItems: raw.actionItems || []
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Fallback (keyword matching)
  // ─────────────────────────────────────────────────────────────────────────

  _fallback(transcripts, categories) {
    const allText = transcripts.map(t => t.text.toLowerCase()).join(' ');
    const allTextRaw = transcripts.map(t => t.text).join(' ');

    let matched = null;
    for (const cat of categories) {
      if (cat.keywords?.some(kw => allText.includes(kw.toLowerCase()))) {
        matched = cat;
        break;
      }
    }

    const sentiment = /thank|great|appreciate/i.test(allText) ? 'positive'
      : /angry|frustrated|terrible/i.test(allText) ? 'negative'
      : 'neutral';

    // Best-effort name extraction from caller lines
    let callerName = null;
    const callerLines = transcripts
      .filter(t => t.speaker === 'user' || t.speaker === 'caller')
      .map(t => t.text);

    for (const line of callerLines) {
      const match = line.match(/(?:i(?:'?m| am)|this is|my name is|it'?s|name'?s)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
      if (match) { callerName = match[1]; break; }
      // "Hi, Ravi here" / "Ravi from Swiggy"
      const match2 = line.match(/^([A-Z][a-z]+)(?:\s+here|\s+from\s+\w+)?[.,!?]?\s*$/);
      if (match2) { callerName = match2[1]; break; }
    }

    return {
      categoryId: matched?.id || 'personal.unknown',
      categoryLabel: matched?.label || 'Unknown',
      confidence: matched ? 0.5 : 0.2,
      summary: allText.slice(0, 120) + (allText.length > 120 ? '...' : ''),
      sentiment,
      callerName,
      organization: null,
      topic: null,
      actionTaken: null,
      urgency: 'normal',
      actionRequired: false,
      actionItems: [],
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
      actionItems: []
    };
  }
}

export default ConversationAnalyzer;
