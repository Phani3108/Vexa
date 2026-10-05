/**
 * Text-intelligence provider router.
 *
 *   ANTHROPIC_API_KEY set → Claude (lib/claude.js)
 *   else OPENAI_API_KEY   → OpenAI chat (lib/openai.js)
 *   else                  → null (callers use the offline engine)
 *
 * Live phone *voice* is separate: it still uses the OpenAI Realtime API
 * (lib/openai.js), because Claude has no speech-to-speech endpoint.
 */

import { claudeConfigured, claudeJson, claudeModel, describeClaudeError } from './claude.js';
import { chatCompletion, isChatConfigured } from './openai.js';

export function llmProvider() {
  if (claudeConfigured()) return 'anthropic';
  if (isChatConfigured()) return 'openai';
  return null;
}

export function llmAvailable() {
  return llmProvider() !== null;
}

export function llmLabel() {
  const p = llmProvider();
  if (p === 'anthropic') return `Claude (${claudeModel()})`;
  if (p === 'openai') return `OpenAI (${process.env.OPENAI_CHAT_DEPLOYMENT || 'gpt-4.1-mini'})`;
  return 'offline engine';
}

/**
 * Structured JSON from whichever provider is configured.
 * `schema` is enforced by Claude; for OpenAI it's described in the prompt (json mode).
 */
export async function structuredJson({ system, user, schema, effort = 'low', maxTokens = 4096, timeoutMs = 15000, purposeModel = 'main' }) {
  const provider = llmProvider();
  if (provider === 'anthropic') {
    try {
      return await claudeJson({ system, user, schema, effort, maxTokens, timeoutMs, purposeModel });
    } catch (err) {
      throw new Error(`Claude: ${describeClaudeError(err)}`);
    }
  }
  if (provider === 'openai') {
    const content = await chatCompletion(process.env, {
      messages: [{ role: 'system', content: `${system}\n\nReturn JSON matching this schema:\n${JSON.stringify(schema)}` }, { role: 'user', content: user }],
      temperature: 0,
      maxTokens: Math.min(maxTokens, 1200),
      json: true,
      timeout: timeoutMs
    });
    return JSON.parse(content);
  }
  throw new Error('No language model configured');
}
