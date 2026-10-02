/**
 * Demo only: synthesize a stereo recording (caller left, Vexa right) for the
 * latest multilingual test call and attach it via the dev upload endpoint,
 * so the recording player + tap-to-seek can be shown without a phone line.
 *   node demo/attach-recording.mjs
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const B = 'http://localhost:3000';
const RATE = 8000;
const VOICES = { caller: { en: 'Rishi', hi: 'Lekha', te: 'Geeta', es: 'Paulina' }, ai: { en: 'Samantha', hi: 'Lekha', te: 'Geeta', es: 'Mónica' } };

let token;
async function api(p, { method = 'GET', body, raw } = {}) {
  const res = await fetch(B + p, {
    method,
    headers: { ...(raw ? { 'Content-Type': 'audio/wav' } : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: raw || (body ? JSON.stringify(body) : undefined)
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${p} ${res.status} ${d.error}`);
  return d;
}

const { devCode } = await api('/api/auth/otp/request', { method: 'POST', body: { phoneNumber: '+15550001077' } });
token = (await api('/api/auth/otp/verify', { method: 'POST', body: { phoneNumber: '+15550001077', code: devCode } })).token;

const { calls } = await api('/api/calls?limit=30&includeTest=1');
let call;
for (const c of calls) {
  const { call: d } = await api(`/api/calls/${c.callId}`);
  if ((d.languages || []).length > 2) { call = d; break; }
}
if (!call) throw new Error('No multilingual call found — run demo/run-multilingual.mjs first');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vexa-rec-'));
function tts(text, voice) {
  const aiff = path.join(tmp, 'l.aiff'), wav = path.join(tmp, 'l.wav');
  execFileSync('say', ['-v', voice, '-o', aiff, text]);
  execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${RATE}`, '-c', '1', aiff, wav]);
  const buf = fs.readFileSync(wav);
  const at = buf.indexOf('data') + 8;
  return new Int16Array(buf.buffer.slice(buf.byteOffset + at, buf.byteOffset + buf.length - ((buf.length - at) % 2)));
}

// Lay lines out on their real timestamps; push later ones back only if speech would overlap.
const start = new Date(call.startedAt || call.createdAt).getTime();
const clips = [];
let cursor = 0;
for (const line of call.transcript) {
  if (line.speaker !== 'caller' && line.speaker !== 'ai') continue;
  const pcm = tts(line.text, VOICES[line.speaker][line.lang] || VOICES[line.speaker].en);
  const at = Math.max(cursor, Math.round(((new Date(line.timestamp).getTime() - start) / 1000) * RATE));
  clips.push({ ch: line.speaker === 'caller' ? 0 : 1, at, pcm });
  cursor = at + pcm.length + Math.round(0.4 * RATE);
}
const pcm = new Int16Array(cursor * 2);
for (const c of clips) for (let i = 0; i < c.pcm.length; i++) pcm[(c.at + i) * 2 + c.ch] = c.pcm[i];

const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.byteLength, 4); header.write('WAVE', 8); header.write('fmt ', 12);
header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.byteLength, 40);
const wav = Buffer.concat([header, Buffer.from(pcm.buffer)]);

const { recording } = await api(`/api/calls/${call.callId}/recording`, { method: 'POST', raw: wav });
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Attached ${recording.durationSec}s stereo recording to ${call.callId}`);
console.log(`Open: ${B}/call/${call.callId}`);
