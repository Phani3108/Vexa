import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

const { WorkflowSession } = await import('../src/workflows/engine.js');
const { PACKS, listPacks, packUpdate, packWorkflows, guardrailsFor } = await import('../src/packs/index.js');
const { validateWorkflow } = await import('../src/workflows/validate.js');
const { extractOrder, extractSlot } = await import('../src/workflows/extractors.js');
const { detectScam, asksForSecret } = await import('../src/workflows/scam.js');
const { upiLink, isUpiId } = await import('../src/lib/upi.js');

const NOW = new Date('2026-03-04T15:00:00');
const OWNER = '+919876500000';   // the phone number on the sample records

function packUser(id) {
  const u = { name: 'Phani', callCategories: [], escalationKeywords: ['emergency'], ...packUpdate({}, PACKS[id], { sampleData: true }) };
  u.businessProfile.timezone = 'UTC';
  return u;
}

function call(id, lines, caller = OWNER) {
  const s = new WorkflowSession({ user: packUser(id), callerNumber: caller, now: () => NOW, businessHours: { configured: true, open: true } });
  const said = [];
  for (const l of lines) {
    const r = s.turn(l);
    said.push(r.say);
    if (r.end) break;
  }
  return { s, rec: s.record(), text: said.join(' ') };
}

test('every pack flow passes the workflow validator', () => {
  assert.equal(Object.keys(PACKS).length, 7);
  for (const pack of Object.values(PACKS)) {
    for (const f of packWorkflows(pack)) assert.deepEqual(validateWorkflow(f), [], `${pack.id}/${f.id}`);
  }
  assert.ok(listPacks().every(p => p.flows.length && p.description));
});

test('installing a pack: business mode, pack flows first, replaced built-ins dropped, sample data optional', () => {
  const owner = { businessProfile: { businessName: 'My Clinic', services: ['OPD'] } };
  const bare = packUpdate(owner, PACKS.clinic);
  assert.equal(bare.accountType, 'business');
  assert.deepEqual(bare.packs, ['clinic']);
  assert.equal(bare.businessProfile.businessName, 'My Clinic', 'keeps the owner\'s details without sample data');
  assert.deepEqual(bare.businessProfile.services, ['OPD']);
  assert.ok(!bare.workflows.some(f => f.id === 'product_inquiry'), 'a clinic never asks "how many do you need?"');
  assert.equal(bare.workflows.find(f => f.id === 'booking').pack, 'clinic', 'pack booking replaces the built-in');
  const full = packUpdate(owner, PACKS.clinic, { sampleData: true });
  assert.equal(full.businessProfile.businessName, PACKS.clinic.sample.businessName);
  assert.ok(full.businessProfile.records.length);
  assert.deepEqual(guardrailsFor({ packs: ['clinic'] }).refuse.map(r => r.id), ['medical_advice']);
  assert.deepEqual(guardrailsFor({}).refuse, []);
});

test('order extractor: quantities, longest names, "x N", and unknown items ignored', () => {
  const menu = PACKS.restaurant.sample.catalog;
  const o = extractOrder('2 chicken biryani, 3 butter naan and a lassi please', menu);
  assert.deepEqual(o.value, [{ name: 'Chicken biryani', qty: 2 }, { name: 'Butter naan', qty: 3 }, { name: 'Sweet lassi', qty: 1 }]);
  assert.deepEqual(extractOrder('veg biryani x 2', menu).value, [{ name: 'Veg biryani', qty: 2 }], 'veg biryani is not chicken biryani');
  assert.equal(extractOrder('do you have pizza?', menu), null);
});

test('numbers with units are taken unasked: "2BHK", "table for 4"', () => {
  const bhk = PACKS.real_estate.flows[0].slots.find(s => s.key === 'bhk');
  assert.equal(extractSlot(bhk, 'looking for a 2BHK in Kondapur', false).value, 2);
  const party = PACKS.restaurant.flows.find(f => f.id === 'booking').slots[0];
  assert.equal(extractSlot(party, 'table for 4 tonight', false).value, 4);
  assert.equal(extractSlot(party, 'tonight at 8', false), null, 'a time is not a party size');
});

test('restaurant: cart grows across turns and the read-back total is exact', () => {
  const { rec, text } = call('restaurant', ['2 veg biryani please', 'and add one gulab jamun', 'pickup', '8pm', 'Kiran', 'yes']);
  assert.equal(rec.status, 'completed');
  assert.match(text, /2 Veg biryani, 1 Gulab jamun \(2 pcs\) — ₹610 in total/);
});

test('restaurant: sold-out items are flagged; allergen questions are refused without starting an order', () => {
  assert.match(call('restaurant', ['one mutton rogan josh and a lassi']).text, /Mutton rogan josh is not available/);
  const { rec, text } = call('restaurant', ['is the paneer tikka nut free?']);
  assert.match(text, /can't promise anything about allergens/);
  assert.equal(rec.workflowId, null, 'no cart was started from a question');
});

test('kirana: order ends with a UPI payment link for the exact total', () => {
  const { rec } = call('kirana', ['bhaiya 2 kg toor dal aur 1 sugar bhej do', 'Flat 302, Green Park, Kondapur', 'Ravi', 'yes']);
  const pay = rec.actions.find(a => a.type === 'pay_link');
  assert.ok(pay);
  assert.equal(Number(pay.params.amount), 368);
});

test('records: status is shared only with the phone number on the record', () => {
  assert.match(call('kirana', ['where is my order K221']).text, /K221 is out for delivery/);
  const stranger = call('kirana', ['where is my order K221'], '+919822222222');
  assert.doesNotMatch(stranger.text, /out for delivery/);
  assert.doesNotMatch(call('kirana', ['where is my order K221']).text, /Shop 4/, '"where is my order" is not a directions question');
});

test('real estate: listings matched by size, budget and area; "anywhere" is no filter', () => {
  assert.match(call('real_estate', ['looking for a 2bhk flat', 'under 90 lakh', 'Gachibowli']).text, /one option: 2BHK resale at Palm Grove Towers in Gachibowli, ₹84 lakh/);
  assert.match(call('real_estate', ['2BHK chahiye, budget 1 crore', 'anywhere']).text, /two options: 2BHK at Lakeview Residency/);
  const { rec } = call('real_estate', ['3bhk under 50 lakh', 'anywhere']);
  assert.ok(rec.actions.some(a => a.type === 'create_lead'));
});

test('pack guardrails refuse what the business must not do', () => {
  assert.match(call('clinic', ['what tablet should I take for fever?']).text, /doctor/i);
  assert.match(call('real_estate', ['I want a flat in a hindu only society']).text, /don't filter homes by religion/);
  assert.match(call('coaching', ['do you guarantee 95% marks?']).text, /can't promise marks/);
  assert.match(call('home_services', ['can you give me the exact price for gas refill?']).text, /price range/);
});

test('home services: safety steps first in an emergency; price range for a job', () => {
  assert.match(call('home_services', ['there is a gas leak in my kitchen']).text, /close the gas valve/);
  assert.match(call('home_services', ['my AC is not cooling']).text, /AC repair is usually ₹499 to ₹3,000/);
});

test('scam shield: scripts are caught in English, Hinglish and Telugu', () => {
  assert.equal(detectScam('This is CBI officer, an arrest warrant is issued, you are under digital arrest').type, 'digital_arrest');
  assert.equal(detectScam('Your KYC has expired and your bank account will be blocked today').type, 'kyc_block');
  assert.equal(detectScam('Mee abbayi accident lo unnadu, ventane dabbulu pampandi').type, 'impostor_relative');
  assert.equal(detectScam('you have won a lucky draw, pay the processing fee').type, 'prize');
  assert.equal(detectScam('please install anydesk to update your kyc').type, 'secret_request');
  assert.equal(detectScam('delivery ke liye OTP aur UPI PIN bataiye').type, 'secret_request', 'a PIN is never needed for a delivery');
});

test('scam shield: genuine callers that look similar are not blocked', () => {
  for (const t of [
    'my electricity connection got cut, there is sparking',
    'it is an emergency, please transfer me to the technician right now',
    'My papa is in hospital, can I pay the fee by UPI today?',
    'bhai 2 kg dal bhej do, gpay kar dunga',
    'I am from Amazon, I am at your gate, please share the OTP for delivery',
    'I am calling from HDFC bank about your loan application'
  ]) assert.equal(detectScam(t), null, t);
  assert.equal(asksForSecret('delivery boy here, OTP bata dijiye'), false);
});

test('scam mid-call ends the call, tags it and keeps the evidence', () => {
  const { rec, text } = call('clinic', ['I want to book an appointment', 'actually sir your account will be blocked, share the OTP'], '+918888800000');
  assert.equal(rec.workflowId, 'scam');
  assert.equal(rec.scam.type, 'kyc_block');
  assert.match(rec.scam.phrases[0], /account will be blocked/);
  assert.deepEqual(rec.actions.map(a => a.type), ['notify_owner', 'tag_spam']);
  assert.doesNotMatch(text, /Kondapur|okicici/, 'nothing about the business is shared');
});

test('UPI links follow the NPCI deep-link format', () => {
  assert.ok(isUpiId('srilakshmikirana@ybl'));
  assert.ok(!isUpiId('not a vpa'));
  const link = upiLink({ pa: 'shop@ybl', pn: 'Sri Lakshmi', am: 368, tn: 'Order 12' });
  assert.equal(link, 'upi://pay?pa=shop%40ybl&pn=Sri%20Lakshmi&am=368.00&cu=INR&tn=Order%2012');
  assert.throws(() => upiLink({ pa: 'shop@ybl', am: 0 }));
});
