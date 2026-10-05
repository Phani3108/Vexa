/**
 * Per-call AI usage & cost tracking.
 *
 * Every Claude request made while handling a call (understanding each turn,
 * post-call analysis) is attributed to that call via AsyncLocalStorage, so the
 * app can show exactly what each call cost.
 *
 * Prices are USD per million tokens (Anthropic first-party API list prices).
 * Thinking tokens are billed as output tokens and are included in output_tokens.
 */

import { AsyncLocalStorage } from 'async_hooks';

const store = new AsyncLocalStorage();

export const PRICING = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 }
};

function priceFor(model) {
  const key = Object.keys(PRICING).find(k => (model || '').startsWith(k));
  return key ? PRICING[key] : null;
}

export function costOf(model, u) {
  const p = priceFor(model);
  if (!p) return null;
  return (
    (u.input_tokens || 0) * p.input +
    (u.output_tokens || 0) * p.output +
    (u.cache_read_input_tokens || 0) * p.cacheRead +
    (u.cache_creation_input_tokens || 0) * p.cacheWrite
  ) / 1e6;
}

/** Create a ledger to attribute usage to (one per call). */
export function newLedger() {
  return { requests: [] };
}

/** Run fn with every Claude request inside attributed to `ledger` under `purpose`. */
export function withLedger(ledger, purpose, fn) {
  if (!ledger) return fn();
  return store.run({ ledger, purpose }, fn);
}

/** Called by the Claude client after every response. */
export function recordUsage(model, usage, latencyMs) {
  const ctx = store.getStore();
  if (!ctx || !usage) return;
  ctx.ledger.requests.push({
    purpose: ctx.purpose,
    model,
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
    cacheReadTokens: usage.cache_read_input_tokens || 0,
    cacheWriteTokens: usage.cache_creation_input_tokens || 0,
    costUsd: costOf(model, usage),
    latencyMs
  });
}

/** Totals for display/persistence. */
export function summarize(ledger) {
  const reqs = ledger?.requests || [];
  const sum = (k) => reqs.reduce((s, r) => s + (r[k] || 0), 0);
  const byPurpose = {};
  for (const r of reqs) {
    const b = (byPurpose[r.purpose] ||= { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    b.requests++;
    b.inputTokens += r.inputTokens;
    b.outputTokens += r.outputTokens;
    b.costUsd += r.costUsd || 0;
  }
  return {
    requests: reqs.length,
    model: reqs[0]?.model || null,
    inputTokens: sum('inputTokens'),
    outputTokens: sum('outputTokens'),
    cacheReadTokens: sum('cacheReadTokens'),
    costUsd: Math.round(sum('costUsd') * 1e6) / 1e6,
    avgLatencyMs: reqs.length ? Math.round(sum('latencyMs') / reqs.length) : 0,
    byPurpose,
    detail: reqs
  };
}
