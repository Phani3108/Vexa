/**
 * Claude (Anthropic) client for Vexa's text intelligence:
 * per-turn understanding, post-call analysis, and "Ask Vexa" commands.
 *
 * Every call uses structured outputs (output_config.format json_schema), so the
 * response is guaranteed to be parseable JSON matching the schema.
 *
 * Env:
 *   ANTHROPIC_API_KEY   required
 *   ANTHROPIC_MODEL     default claude-opus-5-5
 *   ANTHROPIC_FALLBACKS "default" (server-side refusal fallback) | "off"
 */

import Anthropic from '@anthropic-ai/sdk';
import { recordUsage } from './usage.js';

const DEFAULT_MODEL = 'claude-opus-5-5';
let client = null;

export function claudeConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function claudeModel(kind = 'main') {
  // Optional faster model for per-turn work (understanding, translation, directions)
  if (kind === 'fast' && process.env.ANTHROPIC_FAST_MODEL) return process.env.ANTHROPIC_FAST_MODEL;
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

function getClient() {
  if (!client) client = new Anthropic({ maxRetries: 1 });
  return client;
}

/**
 * One structured request → parsed JSON object.
 * @param {object} opts
 *   system, user  — prompt text
 *   schema        — JSON schema (every object needs additionalProperties: false)
 *   effort        — 'low' | 'medium' | 'high'
 *   maxTokens     — includes thinking tokens (thinking is always on for Opus 5.5)
 *   timeoutMs     — per-request timeout
 */
export async function claudeJson({ system, user, schema, effort = 'low', maxTokens = 4096, timeoutMs = 15000, purposeModel = 'main' }) {
  const model = claudeModel(purposeModel);
  // Server-side fallbacks and `effort` are supported on the current Opus/Sonnet/Fable
  // generation; Haiku 4.5 rejects `effort`, so it is omitted there.
  const modern = /^claude-(opus-5|sonnet-5|fable-5)/.test(model);
  const fallbacks = modern && process.env.ANTHROPIC_FALLBACKS !== 'off';
  const started = Date.now();
  const response = await getClient().beta.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: {
      ...(modern ? { effort } : {}),
      format: { type: 'json_schema', schema }
    },
    // If a safety classifier declines, re-run on Anthropic's recommended fallback model
    ...(fallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {})
  }, { timeout: timeoutMs });

  recordUsage(response.model || model, response.usage, Date.now() - started);

  if (response.stop_reason === 'refusal') {
    throw new Error(`Claude declined the request (${response.stop_details?.category || 'unspecified'})`);
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('Claude response hit max_tokens before finishing');
  }
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return JSON.parse(text);
}

/** Human-readable reason for logs, using the SDK's typed errors. */
export function describeClaudeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'invalid ANTHROPIC_API_KEY';
  if (err instanceof Anthropic.RateLimitError) return 'rate limited';
  if (err instanceof Anthropic.APIConnectionTimeoutError) return 'timed out';
  if (err instanceof Anthropic.BadRequestError) return `bad request: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `API error ${err.status}: ${err.message}`;
  return err?.message || String(err);
}

/** Helpers for schemas */
export const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
export function strictObject(properties) {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}
