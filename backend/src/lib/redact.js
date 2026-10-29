/**
 * Keeps secrets out of logs.
 *
 * Imported first by app.js: it patches console.* so every log line in the
 * process (including errors thrown by SDKs and HTTP clients that carry request
 * headers) is scrubbed of API keys and bearer tokens. The Winston logger uses
 * the same rules through `redactFormat`.
 */

import util from 'util';

const RULES = [
  [/sk-ant-[A-Za-z0-9_-]{8,}/g, 'sk-ant-[redacted]'],
  [/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}/g, 'sk-[redacted]'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [redacted]'],
  [/(["']?(?:x-api-key|api-key|apikey|api_key|authorization|auth_token|authToken|password|secret)["']?\s*[:=]\s*["']?)[^"',\s}]{4,}/gi, '$1[redacted]']
];

export function redact(text) {
  let out = String(text);
  for (const [re, rep] of RULES) out = out.replace(re, rep);
  return out;
}

/** Axios and SDK errors carry request config and headers; keep only what helps debugging. */
export function safeError(err) {
  if (!err || typeof err !== 'object') return err;
  const status = err.response?.status ?? err.status;
  const detail = err.response?.data?.error?.message || err.error?.message || err.message;
  const clean = new Error(redact(`${status ? `HTTP ${status}: ` : ''}${detail || 'request failed'}`));
  clean.status = status;
  clean.code = err.code;
  return clean;
}

const format = (args) => redact(util.format(...args));

let installed = false;
export function installConsoleRedaction() {
  if (installed) return;
  installed = true;
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = console[level].bind(console);
    console[level] = (...args) => original(format(args));
  }
}

installConsoleRedaction();
