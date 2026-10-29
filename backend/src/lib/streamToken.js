/**
 * Short-lived, single-use tokens that authorise a phone provider's media
 * stream (the WebSocket carrying call audio).
 *
 * The call webhook (already signature-checked) signs a token bound to the
 * provider's call id and hands it to the provider inside the stream
 * instructions (Twilio: <Parameter name="token">). When the audio WebSocket
 * opens, the first "start" frame must carry that token for the same call,
 * or the socket is closed before any AI session is opened.
 */

import crypto from 'crypto';

const TTL_MS = 2 * 60 * 1000;
const used = new Map(); // nonce → expiry (single-use; moves to Redis with multi-instance)

function secret() {
  if (process.env.STREAM_TOKEN_SECRET) return process.env.STREAM_TOKEN_SECRET;
  // Derived from the JWT secret so no extra setting is required; distinct from JWTs.
  const base = process.env.JWT_SECRET || 'vexa-dev-secret-change-me';
  return crypto.createHmac('sha256', base).update('vexa-stream-token-v1').digest('hex');
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const mac = (body) => crypto.createHmac('sha256', secret()).update(body).digest('base64url');

/** Token for one call's media stream. */
export function signStreamToken(callId, { ttlMs = TTL_MS, now = Date.now() } = {}) {
  if (!callId) throw new Error('signStreamToken: callId required');
  const body = b64url(JSON.stringify({ c: String(callId), e: now + ttlMs, n: crypto.randomBytes(9).toString('base64url') }));
  return `${body}.${mac(body)}`;
}

/**
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function verifyStreamToken(token, callId, { now = Date.now() } = {}) {
  if (typeof token !== 'string' || !token.includes('.')) return { ok: false, reason: 'missing' };
  const [body, sig] = token.split('.');
  const expected = mac(body);
  if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return { ok: false, reason: 'bad-signature' };
  }
  let claims;
  try { claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return { ok: false, reason: 'malformed' }; }
  if (claims.e < now) return { ok: false, reason: 'expired' };
  if (claims.c !== String(callId)) return { ok: false, reason: 'wrong-call' };
  sweep(now);
  if (used.has(claims.n)) return { ok: false, reason: 'replayed' };
  used.set(claims.n, claims.e);
  return { ok: true };
}

function sweep(now) {
  if (used.size < 1000) return;
  for (const [n, exp] of used) if (exp < now) used.delete(n);
}

/** Always on in production; elsewhere it can be turned off for local tools that open the stream by hand. */
export function streamAuthEnabled() {
  return process.env.NODE_ENV === 'production' || process.env.STREAM_AUTH !== 'off';
}
