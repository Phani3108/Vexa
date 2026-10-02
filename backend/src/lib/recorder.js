/**
 * Call recorder for live phone calls.
 *
 * Twilio streams the caller's audio to us (8 kHz G.711 μ-law) and we stream
 * Vexa's voice back in the same format, so both sides already pass through
 * the server. The recorder places each side on its own channel of one WAV:
 *
 *   left  = caller        right = Vexa (or you, after a takeover — not captured)
 *
 * Timing uses Twilio's media timestamps (ms since the stream started), so the
 * two channels line up with what the caller actually heard. When the caller
 * interrupts (barge-in), audio Vexa had queued but never played is cut.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RATE = 8000;
const MAX_SECONDS = 2 * 60 * 60;

const here = path.dirname(fileURLToPath(import.meta.url));
export const RECORDINGS_DIR = path.resolve(process.env.RECORDINGS_DIR || path.join(here, '../../.data/recordings'));

// G.711 μ-law → 16-bit linear PCM
const ULAW = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  const u = ~i & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  ULAW[i] = sign ? -sample : sample;
}

export function decodeUlaw(buf) {
  const out = new Int16Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = ULAW[buf[i]];
  return out;
}

export class CallRecorder {
  constructor(callId) {
    this.callId = callId;
    this.startedAt = new Date();
    this.inbound = [];      // { at: sampleIndex, pcm }
    this.outbound = [];     // { at, pcm }
    this.outCursor = 0;     // next sample where Vexa audio would play
  }

  /** Caller audio frame (base64 μ-law) at Twilio timestamp ms. */
  addInbound(payloadB64, timestampMs) {
    const at = Math.round((Number(timestampMs) || 0) * RATE / 1000);
    if (at > MAX_SECONDS * RATE) return;
    this.inbound.push({ at, pcm: decodeUlaw(Buffer.from(payloadB64, 'base64')) });
  }

  /** Vexa audio delta (base64 μ-law); plays after anything already queued. */
  addOutbound(payloadB64, nowMs) {
    const now = Math.round((Number(nowMs) || 0) * RATE / 1000);
    const at = Math.max(this.outCursor, now);
    if (at > MAX_SECONDS * RATE) return;
    const pcm = decodeUlaw(Buffer.from(payloadB64, 'base64'));
    this.outbound.push({ at, pcm });
    this.outCursor = at + pcm.length;
  }

  /** Caller barged in at nowMs: Twilio dropped Vexa's unplayed audio, so do we. */
  clearOutboundAfter(nowMs) {
    const cut = Math.round((Number(nowMs) || 0) * RATE / 1000);
    this.outbound = this.outbound
      .filter(c => c.at < cut)
      .map(c => (c.at + c.pcm.length > cut ? { at: c.at, pcm: c.pcm.subarray(0, cut - c.at) } : c));
    this.outCursor = Math.min(this.outCursor, cut);
  }

  get hasAudio() {
    return this.inbound.length > 0 || this.outbound.length > 0;
  }

  /** Render a stereo 16-bit WAV buffer. */
  toWav() {
    const end = (chunks) => chunks.reduce((m, c) => Math.max(m, c.at + c.pcm.length), 0);
    const samples = Math.min(Math.max(end(this.inbound), end(this.outbound)), MAX_SECONDS * RATE);
    const pcm = new Int16Array(samples * 2);
    for (const c of this.inbound) for (let i = 0; i < c.pcm.length && c.at + i < samples; i++) pcm[(c.at + i) * 2] = c.pcm[i];
    for (const c of this.outbound) for (let i = 0; i < c.pcm.length && c.at + i < samples; i++) pcm[(c.at + i) * 2 + 1] = c.pcm[i];
    return { wav: wavBuffer(pcm, 2, RATE), durationSec: samples / RATE };
  }

  /** Write to RECORDINGS_DIR; returns the metadata stored on the Call. */
  save() {
    if (!this.hasAudio) return null;
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
    const { wav, durationSec } = this.toWav();
    const file = `${this.callId.replace(/[^\w.-]/g, '_')}.wav`;
    fs.writeFileSync(path.join(RECORDINGS_DIR, file), wav);
    return { file, durationSec: Math.round(durationSec * 10) / 10, sizeBytes: wav.length, channels: 2, sampleRate: RATE, startedAt: this.startedAt, source: 'media-stream' };
  }
}

export function wavBuffer(int16, channels, rate) {
  const header = Buffer.alloc(44);
  const dataBytes = int16.length * 2;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataBytes, 40);
  return Buffer.concat([header, Buffer.from(int16.buffer, int16.byteOffset, dataBytes)]);
}

export function recordingPath(file) {
  const safe = path.basename(String(file || ''));
  return path.join(RECORDINGS_DIR, safe);
}

export function deleteRecordingFile(file) {
  try { fs.unlinkSync(recordingPath(file)); } catch { /* already gone */ }
}
