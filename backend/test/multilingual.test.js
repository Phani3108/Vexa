import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.NODE_ENV = 'test';
process.env.RECORDINGS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vexa-rec-'));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const { detectLanguage, normalizeLanguage } = await import('../src/lib/language.js');
const { CallRecorder, decodeUlaw } = await import('../src/lib/recorder.js');
const { translateText } = await import('../src/lib/translate.js');
const { WorkflowSession } = await import('../src/workflows/engine.js');
const { defaultWorkflows } = await import('../src/workflows/templates.js');
const { buildIndustryTemplate } = await import('../src/config/templates.js');

test('detects all supported languages from script and words', () => {
  assert.equal(detectLanguage('నమస్తే, నాకు అపాయింట్‌మెంట్ కావాలి'), 'te');
  assert.equal(detectLanguage('नमस्ते, मुझे अपॉइंटमेंट चाहिए'), 'hi');
  assert.equal(detectLanguage('नमस्कार, मला अपॉइंटमेंट पाहिजे आहे'), 'mr');
  assert.equal(detectLanguage('வணக்கம், எனக்கு ஒரு அப்பாயிண்ட்மென்ட் வேண்டும்'), 'ta');
  assert.equal(detectLanguage('നമസ്കാരം, എനിക്ക് ഒരു അപ്പോയിന്റ്മെന്റ് വേണം'), 'ml');
  assert.equal(detectLanguage('નમસ્તે, મારે એપોઇન્ટમેન્ટ જોઈએ છે'), 'gu');
  assert.equal(detectLanguage('Hola, quiero una cita para mañana'), 'es');
  assert.equal(detectLanguage('Hi, I need an appointment'), 'en');
  assert.equal(normalizeLanguage('TE'), 'te');
  assert.equal(normalizeLanguage('fr'), null);
});

test('without a model, translation falls back to English instead of failing the call', async () => {
  assert.equal(await translateText('Could I get your name, please?', 'te'), 'Could I get your name, please?');
});

test('a "yes" in any language confirms (model confirmation signal)', () => {
  const tpl = buildIndustryTemplate('home_services');
  const user = { accountType: 'business', name: 'Maria', businessProfile: { ...tpl.businessProfile, businessName: 'Bright' }, callCategories: tpl.callCategories, workflows: defaultWorkflows('business') };
  const s = new WorkflowSession({ user, callerNumber: '+15125550142', businessHours: { configured: true, open: true } });
  s.turn('Hi, this is Dana Smith, I need a quote for a water heater install tomorrow morning');
  const r = s.turn('అవును, సరిగ్గా ఉంది', { used: true, slots: {}, confirmation: 'yes', language: 'te' });
  assert.equal(r.end, true);
});

test('recorder: two aligned channels, barge-in removes unplayed audio, valid WAV', () => {
  const rec = new CallRecorder('CAtest123');
  const ulawFrame = Buffer.alloc(160, 0x00).toString('base64'); // 20 ms of loud μ-law
  for (let ms = 0; ms < 1000; ms += 20) rec.addInbound(ulawFrame, ms);          // caller: 0–1 s
  rec.addOutbound(Buffer.alloc(8000, 0x00).toString('base64'), 1000);          // Vexa: 1 s queued at 1.0 s
  rec.clearOutboundAfter(1500);                                                 // caller barged in at 1.5 s
  const { wav, durationSec } = rec.toWav();
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt16LE(22), 2);          // stereo
  assert.equal(wav.readUInt32LE(24), 8000);       // 8 kHz
  assert.equal(durationSec, 1.5);                 // Vexa cut at 1.5 s, not 2.0 s
  const sample = (sec, ch) => wav.readInt16LE(44 + (Math.floor(sec * 8000) * 2 + ch) * 2);
  assert.notEqual(sample(0.5, 0), 0);             // caller on the left at 0.5 s
  assert.equal(sample(0.5, 1), 0);                // Vexa silent then
  assert.notEqual(sample(1.2, 1), 0);             // Vexa on the right at 1.2 s
  const meta = rec.save();
  assert.ok(fs.existsSync(path.join(process.env.RECORDINGS_DIR, meta.file)));
  assert.equal(meta.channels, 2);
  assert.equal(decodeUlaw(Buffer.from([0xff]))[0], 0); // μ-law silence decodes to 0
});
