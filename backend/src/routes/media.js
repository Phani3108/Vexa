/**
 * Recordings & transcript translations.
 *
 *   GET    /api/calls/:id/recording-link   → short-lived signed URL (audio players can't send auth headers)
 *   DELETE /api/calls/:id/recording        → delete the audio, keep the transcript
 *   POST   /api/calls/:id/recording        → (dev/demo only) attach a WAV to a call
 *   POST   /api/calls/:id/translate        → { lang } transcript + summary in any supported language
 *   GET    /media/recordings/:token        → streams the WAV (Range requests supported)
 */

import express from 'express';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { authenticate } from '../middleware/auth.js';
import Call from '../models/mongodb/Call.js';
import UserConfig from '../models/mongodb/UserConfig.js';
import { recordingPath, deleteRecordingFile, RECORDINGS_DIR } from '../lib/recorder.js';
import { translateLines, translateText } from '../lib/translate.js';
import { LANGUAGES, normalizeLanguage } from '../lib/language.js';
import { newLedger, withLedger, summarize } from '../lib/usage.js';
import path from 'path';

const SECRET = process.env.JWT_SECRET || 'vexa-dev-secret-change-me';
const LINK_TTL = 15 * 60; // seconds

export const callMediaRouter = express.Router();

callMediaRouter.get('/:id/recording-link', authenticate, async (req, res) => {
  const call = await Call.findOne({ callId: req.params.id, userId: req.userId }).lean();
  if (!call?.recording?.file) return res.status(404).json({ error: 'No recording for this call' });
  const token = jwt.sign({ type: 'recording', callId: call.callId, userId: req.userId }, SECRET, { expiresIn: LINK_TTL });
  res.json({ url: `/media/recordings/${token}`, expiresIn: LINK_TTL, recording: call.recording });
});

callMediaRouter.delete('/:id/recording', authenticate, async (req, res) => {
  const call = await Call.findOne({ callId: req.params.id, userId: req.userId });
  if (!call?.recording?.file) return res.status(404).json({ error: 'No recording for this call' });
  deleteRecordingFile(call.recording.file);
  call.recording = undefined;
  await call.save();
  res.json({ success: true });
});

// Demo/dev: attach audio to a call (e.g. synthesized demo recordings). Never enabled in production.
callMediaRouter.post('/:id/recording', authenticate, express.raw({ type: ['audio/wav', 'audio/x-wav', 'application/octet-stream'], limit: '50mb' }), async (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEMO_DATA !== 'true') return res.status(404).json({ error: 'Route not found' });
  const call = await Call.findOne({ callId: req.params.id, userId: req.userId });
  if (!call) return res.status(404).json({ error: 'Call not found' });
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') return res.status(400).json({ error: 'Send a WAV file' });
  const channels = buf.readUInt16LE(22);
  const rate = buf.readUInt32LE(24);
  const bytesPerSec = buf.readUInt32LE(28);
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
  const file = `${call.callId.replace(/[^\w.-]/g, '_')}.wav`;
  fs.writeFileSync(path.join(RECORDINGS_DIR, file), buf);
  call.recording = { file, durationSec: Math.round(((buf.length - 44) / bytesPerSec) * 10) / 10, sizeBytes: buf.length, channels, sampleRate: rate, startedAt: call.startedAt || call.createdAt, source: 'upload' };
  await call.save();
  res.json({ recording: call.recording });
});

callMediaRouter.post('/:id/translate', authenticate, async (req, res) => {
  const lang = normalizeLanguage(req.body?.lang);
  if (!lang) return res.status(400).json({ error: `lang must be one of ${Object.keys(LANGUAGES).join(', ')}` });
  const call = await Call.findOne({ callId: req.params.id, userId: req.userId });
  if (!call) return res.status(404).json({ error: 'Call not found' });
  if (call.translations?.[lang]) return res.json({ lang, ...call.translations[lang], cached: true });

  const ledger = newLedger();
  const lines = call.transcript.map(l => (l.lang === lang ? { text: l.text, lang } : { text: l.textEn || l.text, lang: 'en' }));
  const translated = await withLedger(ledger, 'translation', () => translateLines(lines, lang));
  const summary = call.analysis?.summary
    ? (call.analysis.summaryLocal?.lang === lang ? call.analysis.summaryLocal.text : await withLedger(ledger, 'translation', () => translateText(call.analysis.summary, lang, { timeoutMs: 20000 })))
    : null;
  const result = { lines: translated, summary, aiUsage: summarize(ledger) };
  call.translations = { ...(call.translations || {}), [lang]: result };
  call.markModified('translations');
  await call.save();
  res.json({ lang, ...result });
});

export const mediaRouter = express.Router();

mediaRouter.get('/recordings/:token', async (req, res) => {
  let claims;
  try {
    claims = jwt.verify(req.params.token, SECRET);
    if (claims.type !== 'recording') throw new Error('wrong token');
  } catch {
    return res.status(401).json({ error: 'Link expired — reopen the call to play the recording' });
  }
  const call = await Call.findOne({ callId: claims.callId, userId: claims.userId }).lean();
  if (!call?.recording?.file) return res.status(404).json({ error: 'Recording not found' });
  const file = recordingPath(call.recording.file);
  let stat;
  try { stat = fs.statSync(file); } catch { return res.status(404).json({ error: 'Recording file missing' }); }

  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=600');
  const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    if (start >= stat.size || start > end) return res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    res.setHeader('Content-Length', end - start + 1);
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.setHeader('Content-Length', stat.size);
  fs.createReadStream(file).pipe(res);
});

/** Delete recordings older than each owner's retention window (default 90 days). */
export async function enforceRecordingRetention() {
  const owners = await UserConfig.find({}, { userId: 1, recording: 1 }).lean();
  let removed = 0;
  for (const o of owners) {
    const days = Math.max(1, Number(o.recording?.retentionDays) || 90);
    const cutoff = new Date(Date.now() - days * 86400000);
    const old = await Call.find({ userId: o.userId, 'recording.file': { $exists: true }, createdAt: { $lt: cutoff } });
    for (const c of old) {
      deleteRecordingFile(c.recording.file);
      c.recording = undefined;
      await c.save();
      removed++;
    }
  }
  if (removed) console.log(`🗑️  Retention: removed ${removed} expired recording(s)`);
  return removed;
}
