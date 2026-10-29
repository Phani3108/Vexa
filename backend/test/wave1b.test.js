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

test('the AI cannot route a question about something we sell into a flow that cannot sell it', () => {
  const user = { name: 'Phani', callCategories: [], escalationKeywords: ['emergency'], ...packUpdate({}, PACKS.kirana, { sampleData: true }) };
  user.businessProfile.timezone = 'UTC';
  const s = new WorkflowSession({ user, callerNumber: '+919876500000', now: () => NOW, businessHours: { configured: true, open: true } });
  const r = s.turn('LED bulb hai kya? Kitne ka hai?', { used: true, intent: 'info_request', slots: {} });
  assert.equal(s.active.id, 'home_order');
  assert.ok(!r.end, 'the conversation carries on');
  assert.equal(r.asked, 'items');
});

test('daily AI budget: owner limit capped by the server; a blocked ledger never reaches the model', async () => {
  const { budgetFor, MAX_DAILY_USD, DEFAULT_DAILY_USD } = await import('../src/services/quotaService.js');
  assert.equal(budgetFor({}), DEFAULT_DAILY_USD);
  assert.equal(budgetFor({ limits: { dailyAiUsd: 2 } }), 2);
  assert.equal(budgetFor({ limits: { dailyAiUsd: 99999 } }), MAX_DAILY_USD);
  const { structuredJson } = await import('../src/lib/llm.js');
  const { newLedger, withLedger } = await import('../src/lib/usage.js');
  const ledger = newLedger(); ledger.blocked = true;
  await assert.rejects(withLedger(ledger, 'test', () => structuredJson({ system: 's', user: 'u', schema: {} })), /budget/);
  assert.equal(ledger.requests.length, 0);
});

test('CSV import: quotes, loose headers, lakh/crore prices, per-row errors, Google Sheets only', async () => {
  const { parseCsv, sheetCsvUrl } = await import('../src/services/importService.js');
  assert.deepEqual(parseCsv('a,b\r\n"x, y","he said ""hi"""\n\n1,2'), [['a', 'b'], ['x, y', 'he said "hi"'], ['1', '2']]);
  assert.equal(sheetCsvUrl('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit#gid=42'), 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/export?format=csv&gid=42');
  for (const bad of ['http://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345', 'https://evil.example/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345', 'https://docs.google.com.evil.example/x', 'file:///etc/passwd']) assert.equal(sheetCsvUrl(bad), null, bad);
  const { importData } = await import('../src/services/importService.js');
  const r = await importData('nobody', { kind: 'catalog', dryRun: true, csv: 'Item,MRP,Qty,Also called\nLED bulb,99,120,bulb;batti\nFan,"2,450",,pankha\n,10,1,\nDal,abc,1,' });
  assert.equal(r.wouldImport, 2);
  assert.deepEqual(r.preview[0], { name: 'LED bulb', price: 99, stock: 120, aliases: ['led bulb', 'bulb', 'batti'] });
  assert.equal(r.preview[1].price, 2450);
  assert.equal(r.preview[1].stock, undefined, 'empty stock = not tracked');
  assert.deepEqual(r.errors.map(e => e.row), [4, 5]);
  const l = await importData('nobody', { kind: 'listings', dryRun: true, csv: 'Project,Locality,Bedrooms,Price\nPalm Grove,Gachibowli,2,84 lakh\nOrchid,Kokapet,3,1.65 cr' });
  assert.deepEqual(l.preview.map(x => x.price), [8400000, 16500000]);
  await assert.rejects(importData('nobody', { kind: 'records', csv: 'Customer,Status\nRavi,ready' }), /Missing column: id/);
});

test('editing a flow keeps extraction hints; a callback time is only taken when asked', async () => {
  const { sanitizeWorkflow } = await import('../src/workflows/validate.js');
  const { PACKS } = await import('../src/packs/index.js');
  const booking = PACKS.restaurant.flows.find(f => f.id === 'booking');
  const clean = sanitizeWorkflow(booking);
  assert.equal(clean.slots[0].unitBefore, booking.slots[0].unitBefore);
  assert.equal(sanitizeWorkflow({ ...booking, slots: [{ ...booking.slots[0], unit: 'x)|(.*' }] }).slots[0].unit, undefined, 'unsafe regex text is dropped');
  const { defaultWorkflows } = await import('../src/workflows/templates.js');
  const user = { accountType: 'business', name: 'Owner', businessProfile: { businessName: 'Shop', timezone: 'UTC' }, callCategories: [], workflows: defaultWorkflows('business') };
  const s = new WorkflowSession({ user, callerNumber: '+919876500000', now: () => NOW, businessHours: { configured: true, open: true } });
  s.activate(s.flows.find(f => f.id === 'general_message'), 'test');
  s.turn('This is Arjun from CoolFix, I will come on Monday at 11 am for the AC gas refill');
  assert.equal(s.slots.callbackTime, undefined, '"Monday 11 am" is when he comes, not when to call back');
});

test('Ask Vexa: a phone number given as the person is used as the number', async () => {
  const { parseOffline } = await import('../src/services/assistantService.js');
  const [a] = parseOffline('Tell +919876512345 their parcel is with the watchman');
  assert.equal(a.type, 'note');
  const { extractPhone } = await import('../src/workflows/extractors.js');
  assert.equal(extractPhone(a.who).value, '+919876512345');
});

test('a caller who says goodbye is asked for a name once, then let go', async () => {
  const { defaultWorkflows } = await import('../src/workflows/templates.js');
  const user = { accountType: 'personal', name: 'Phani', callCategories: [], escalationKeywords: [], workflows: defaultWorkflows('personal') };
  const s = new WorkflowSession({ user, callerNumber: '+919876512345', now: () => NOW });
  s.turn('Hello, I wanted to talk about something');
  // As on a real call: the model reads each turn
  const bye = s.turn('Oh, that is all I needed. Thank you, bye!', { used: true, goodbye: true, slots: {} });
  assert.match(bye.say, /could I get your name/);
  const r = s.turn('Ravi.', { used: true, slots: { name: 'Ravi' } });
  assert.equal(r.end, true);
  assert.match(r.say, /Thanks, Ravi/);
});
