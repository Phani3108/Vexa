import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
// Offline only: no model calls from unit tests
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const { extractMemories } = await import('../src/lib/memoryExtract.js');
const { parseOffline } = await import('../src/services/assistantService.js');
const { validSlug, suggestSlug } = await import('../src/services/linkService.js');
const { isSubscription } = await import('../src/lib/webPush.js');
const { interpret } = await import('../src/services/interpreterService.js');
const { TOOLS } = await import('../src/services/agentService.js');
const { WorkflowSession } = await import('../src/workflows/engine.js');
const { PACKS, packUpdate } = await import('../src/packs/index.js');

const NOW = new Date('2026-03-04T15:00:00');

function packCall(id, lines) {
  const user = { name: 'Phani', callCategories: [], escalationKeywords: ['emergency'], ...packUpdate({}, PACKS[id], { sampleData: true }) };
  user.businessProfile.timezone = 'UTC';
  const s = new WorkflowSession({ user, callerNumber: '+919876500000', now: () => NOW, businessHours: { configured: true, open: true } });
  return lines.map(l => s.turn(l));
}

test('memories: promises with a due time and quoted prices, caller lines only', () => {
  const m = extractMemories([
    { speaker: 'user', text: 'The gas refill will cost ₹1,800, I will come tomorrow at 10am' },
    { speaker: 'assistant', text: 'I will call you back tomorrow' },
    { speaker: 'user', text: 'kal tak bhej dunga, 450 rupees lagega' }
  ], { now: NOW, callerName: 'Arjun' });
  assert.deepEqual(m.map(x => x.kind), ['promise', 'quote', 'promise', 'quote']);
  assert.equal(m[1].amount, 1800);
  assert.equal(m[3].amount, 450);
  assert.ok(m[0].due, 'promise has a due time');
  assert.ok(m.every(x => x.who === 'Arjun'));
  assert.deepEqual(extractMemories([{ speaker: 'user', text: 'Hello, is the shop open?' }]), []);
});

test('Ask Vexa: questions about past calls vs commands', () => {
  assert.equal(parseOffline('What did the electrician quote?')[0].type, 'ask');
  assert.equal(parseOffline('did Ravi pay?')[0].type, 'ask');
  assert.deepEqual(parseOffline('When Mom calls, put her through')[0], { type: 'always_transfer', who: 'Mom', phone: null, on: true });
  assert.equal(parseOffline('What did I miss?')[0].type, 'brief');
  assert.equal(parseOffline('Tell Dana her parts arrived')[0].type, 'note');
});

test('Vexa Link names: safe slugs, reserved words refused', () => {
  assert.equal(suggestSlug('Sri Lakshmi Kirana & Hardware'), 'sri-lakshmi-kirana-hardware');
  assert.ok(validSlug('glow-studio'));
  for (const bad of ['ab', 'API', 'api', '-start', 'end-', 'has space', 'x'.repeat(41)]) assert.ok(!validSlug(bad), bad);
  assert.match(suggestSlug('!!'), /^vexa-\d{5}$/);
});

test('Web Push: only well-formed HTTPS subscriptions are stored', () => {
  assert.ok(isSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'x', auth: 'y' } }));
  assert.ok(!isSubscription({ endpoint: 'http://evil.example/x', keys: { p256dh: 'x', auth: 'y' } }));
  assert.ok(!isSubscription({ endpoint: 'https://fcm.googleapis.com/x' }));
  assert.ok(!isSubscription(null));
});

test('interpreter: without a model the words pass through, marked untranslated', async () => {
  assert.deepEqual(await interpret('namaste', 'hi', 'te'), { text: 'namaste', translated: false });
  assert.deepEqual(await interpret('hello', 'en', 'en'), { text: 'hello', translated: true });
});

test('agent API: every tool is described MCP-style', () => {
  const names = TOOLS.map(t => t.name);
  assert.deepEqual(names, ['get_business_info', 'search_catalog', 'ask', 'request_booking', 'place_order']);
  assert.equal(new Set(names).size, names.length);
  for (const t of TOOLS) {
    assert.ok(t.description.length > 20, t.name);
    assert.equal(t.inputSchema.type, 'object', t.name);
  }
  assert.deepEqual(TOOLS.find(t => t.name === 'request_booking').inputSchema.required, ['service', 'preferred_time', 'customer_name', 'customer_phone']);
});

test('a price question is answered but never put in the cart', () => {
  const [r] = packCall('restaurant', ['how much is the chicken biryani?']);
  assert.match(r.say, /Chicken biryani is ₹320/);
  assert.equal(r.asked, 'items', 'asks what they would like instead of assuming an order');
  const [k] = packCall('kirana', ['LED bulb hai kya? kitne ka hai?']);
  assert.match(k.say, /Yes, we have 9W LED bulb in stock\. 9W LED bulb is ₹99/);
  assert.equal(k.asked, 'items');
});
