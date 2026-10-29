import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

process.env.NODE_ENV = 'test';
delete process.env.STREAM_AUTH;
// VoiceAgent logs heavily (emoji banners); keep the test runner's output channel clean
for (const level of ['log', 'warn', 'error']) console[level] = () => {};

const { signStreamToken, verifyStreamToken } = await import('../src/lib/streamToken.js');
const { redact, safeError } = await import('../src/lib/redact.js');
const { default: VoiceAgent } = await import('../src/voice/VoiceAgent.js');

test('stream token: valid once, bound to its call, expires, rejects tampering', () => {
  const t = signStreamToken('CA123');
  assert.deepEqual(verifyStreamToken(t, 'CA123'), { ok: true });
  assert.equal(verifyStreamToken(t, 'CA123').reason, 'replayed');

  assert.equal(verifyStreamToken(signStreamToken('CA123'), 'CA999').reason, 'wrong-call');
  assert.equal(verifyStreamToken(signStreamToken('CA123', { ttlMs: -1 }), 'CA123').reason, 'expired');

  const [body, sig] = signStreamToken('CA123').split('.');
  const forged = Buffer.from(JSON.stringify({ c: 'CA123', e: Date.now() + 60000, n: 'x' })).toString('base64url');
  assert.equal(verifyStreamToken(`${forged}.${sig}`, 'CA123').reason, 'bad-signature');
  assert.equal(verifyStreamToken(`${body}.AAAA`, 'CA123').reason, 'bad-signature');
  assert.equal(verifyStreamToken(undefined, 'CA123').reason, 'missing');
});

class FakeSocket extends EventEmitter {
  constructor() { super(); this.closed = null; }
  send() {}
  close(code, reason) { this.closed = { code, reason }; this.emit('close'); }
}

function agent() {
  return new VoiceAgent({ TWILIO_ACCOUNT_SID: `AC${'0'.repeat(32)}`, TWILIO_AUTH_TOKEN: 'test', OPENAI_API_KEY: 'test' });
}
const startFrame = (callSid, token) => JSON.stringify({ event: 'start', start: { streamSid: 'MZ1', callSid, customParameters: token ? { token } : {} } });

test('media stream: a start frame without a valid token for this call is closed before any AI session', async () => {
  const a = agent();
  for (const token of [undefined, 'garbage.sig', signStreamToken('CA-other')]) {
    const ws = new FakeSocket();
    a.handleMediaStream(ws, {});
    ws.emit('message', startFrame('CA-target', token));
    await new Promise(r => setImmediate(r));
    assert.deepEqual(ws.closed, { code: 1008, reason: 'unauthorized' }, `token ${token}`);
  }
});

test('media stream: a valid token is accepted', async () => {
  const a = agent();
  const ws = new FakeSocket();
  a.handleMediaStream(ws, {});
  ws.emit('message', startFrame('CA-ok', signStreamToken('CA-ok')));
  await new Promise(r => setImmediate(r));
  assert.equal(ws.closed, null);
  ws.emit('close');
});

test('media stream: a socket that never sends start is closed after 5 s', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const ws = new FakeSocket();
    agent().handleMediaStream(ws, {});
    mock.timers.tick(4900);
    assert.equal(ws.closed, null);
    mock.timers.tick(200);
    assert.deepEqual(ws.closed, { code: 1008, reason: 'no start' });
  } finally {
    mock.timers.reset();
  }
});

test('logs never carry API keys or bearer tokens', () => {
  // Fake keys, assembled at runtime so secret scanners don't flag the test file
  const anthropic = ['sk', 'ant', 'api03', 'ABCDEFGHIJKLMNOP'].join('-');
  const openai = ['sk', 'proj', 'abcdefghijklmnopqrstuvwx'].join('-');
  const line = redact(`key ${anthropic} and ${openai}, Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.x.y, {"x-api-key":"secret123"}`);
  assert.doesNotMatch(line, /ABCDEFGHIJKLMNOP|abcdefghijklmnopqrstuvwx|eyJhbGciOiJIUzI1NiJ9|secret123/);
  assert.match(line, /sk-ant-\[redacted\]/);

  const axiosLike = Object.assign(new Error('Request failed'), {
    config: { headers: { Authorization: `Bearer ${openai}` } },
    response: { status: 401, data: { error: { message: `Incorrect API key provided: ${openai}` } } }
  });
  const clean = safeError(axiosLike);
  assert.equal(clean.config, undefined);
  assert.equal(clean.status, 401);
  assert.doesNotMatch(clean.message, /abcdefghijklmnopqrstuvwx/);
});
