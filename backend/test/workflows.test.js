import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

const { WorkflowSession, tidyStatement } = await import('../src/workflows/engine.js');
const { defaultWorkflows } = await import('../src/workflows/templates.js');
const { buildIndustryTemplate } = await import('../src/config/templates.js');
const { extractDateTime, extractName, extractPhone } = await import('../src/workflows/extractors.js');

const NOW = new Date('2026-03-04T15:00:00'); // Wednesday afternoon (local)
const tpl = buildIndustryTemplate('home_services');

function bizUser(overrides = {}) {
  return {
    accountType: 'business',
    name: 'Maria Garcia',
    businessProfile: { ...tpl.businessProfile, businessName: 'Bright Plumbing', address: '12 Main St', bookingUrl: 'https://bright.example/book', transferNumber: '+15125550100', timezone: 'UTC' },
    callCategories: tpl.callCategories,
    escalationKeywords: ['emergency', 'urgent'],
    workflows: defaultWorkflows('business'),
    ...overrides
  };
}

function personalUser(overrides = {}) {
  return {
    accountType: 'personal',
    name: 'Sam Lee',
    deliveryAddress: { flat: 'Apt 4B', street: '9 Oak Ave', city: 'Austin' },
    callCategories: [],
    escalationKeywords: ['emergency', 'hospital'],
    workflows: defaultWorkflows('personal'),
    ...overrides
  };
}

function session(user, extra = {}) {
  return new WorkflowSession({ user, callerNumber: '+15125550142', now: () => NOW, businessHours: { configured: true, open: true }, ...extra });
}

function talk(s, lines) {
  const replies = [];
  for (const l of lines) replies.push(s.turn(l));
  return replies;
}

test('extractors: names, phones and dates', () => {
  assert.equal(extractName('This is Dana Smith', false).value, 'Dana Smith');
  assert.equal(extractName('dana', true).value, 'Dana');
  assert.equal(extractName('tomorrow morning', true), null);
  assert.equal(extractPhone('call me on 512 555 0199').value, '+15125550199');
  assert.equal(extractDateTime('tomorrow at 3pm', false, NOW).display, 'tomorrow 3pm');
  assert.equal(extractDateTime('next friday morning', false, NOW).display, 'next Friday morning');
  assert.equal(extractDateTime('I need a plumber', false, NOW), null);
});

test('tidyStatement strips filler from opening statements', () => {
  assert.equal(tidyStatement('Hi, how much is a water heater install?'), 'a water heater install');
  assert.equal(tidyStatement("Hi, I'm Dana Smith, I need a quote for a water heater install"), 'a water heater install');
  assert.equal(tidyStatement("Hello, I'd like to get a quote for a new bathroom"), 'a new bathroom');
});

test('lead intake: one sentence fills several slots, so fewer questions are asked', () => {
  const s = session(bizUser());
  const [r1] = talk(s, ['Hi, this is Dana Smith, I need a quote for a water heater install tomorrow morning']);
  assert.equal(r1.workflow.id, 'lead_intake');
  // need, name, timing and callback (caller ID) all known → straight to confirmation
  assert.match(r1.say, /water heater install/);
  assert.match(r1.say, /Dana Smith/);
  assert.match(r1.say, /right\?/);
  assert.doesNotMatch(r1.say, /tomorrow morning.*tomorrow morning/, 'timing is not repeated inside the need');
  const r2 = s.turn('yes');
  assert.equal(r2.end, true);
  const rec = s.record();
  assert.equal(rec.status, 'completed');
  assert.equal(rec.questionsAsked, 1);
  assert.ok(rec.slotsSkipped >= 3);
  assert.deepEqual(rec.actions.map(a => a.type), ['create_lead', 'send_sms', 'notify_owner']);
});

test('lead intake: step-by-step with a side question in the middle', () => {
  const s = session(bizUser());
  const r1 = s.turn('How much is a water heater install?');
  assert.equal(r1.workflow.id, 'lead_intake');
  assert.equal(r1.asked, 'name');
  const r2 = s.turn('Do you offer free estimates?');
  assert.match(r2.say, /estimates are free/);
  assert.equal(r2.asked, 'name', 'resumes the flow after answering');
  const r3 = s.turn('Priya');
  assert.equal(r3.asked, 'timing');
  const r4 = s.turn('next Tuesday afternoon');
  assert.match(r4.say, /next Tuesday afternoon/);
  const r5 = s.turn('No, make it Thursday');
  assert.match(r5.say, /Thursday/, 're-confirms with only the corrected slot changed');
  assert.match(r5.say, /water heater install/);
  assert.equal(s.turn('yes, perfect').end, true);
});

test('side question while a date is pending does not become the date', () => {
  const s = session(bizUser());
  s.turn('Can I book an appointment for a drain cleaning?');
  const r = s.turn('Do you offer free estimates?');
  assert.match(r.say, /estimates are free/);
  assert.equal(r.asked, 'when');
  assert.equal(r.slots.when, undefined);
});

test('side question during confirmation is answered, then confirmation is re-asked', () => {
  const s = session(bizUser());
  s.turn('Hi, this is Dana Smith, I need a quote for a water heater install tomorrow morning');
  const r = s.turn('Do you offer free estimates?');
  assert.match(r.say, /estimates are free/);
  assert.match(r.say, /right\?/);
  assert.equal(s.turn('yes').end, true);
});

test('emergency mid-flow switches flows and transfers, carrying the name', () => {
  const s = session(bizUser());
  talk(s, ['I want to book an appointment', 'This is Tom']);
  const r = s.turn('actually water is flooding my basement, it is an emergency');
  assert.equal(r.workflow.id, 'emergency');
  assert.equal(r.asked, 'address');
  const r2 = s.turn('44 Elm Street');
  assert.equal(r2.transfer, true);
  assert.match(r2.say, /Tom/);
});

test('after hours: emergency transfer can be switched off, but still alerts', () => {
  const user = bizUser();
  user.businessProfile.afterHoursEmergencyTransfer = false;
  const s = session(user, { businessHours: { configured: true, open: false, nextOpen: 'tomorrow at 9:00 AM' } });
  const r = talk(s, ['emergency, my pipe burst', '12 Oak Road', 'Lee']).pop();
  assert.equal(r.transfer, false);
  assert.equal(r.end, true);
  assert.ok(s.record().actions.some(a => a.type === 'notify_owner'));
});

test('sales calls end in one turn', () => {
  const s = session(bizUser());
  const r = s.turn('Hi we can get your business ranked on Google with our SEO marketing services');
  assert.equal(r.workflow.id, 'sales_shutdown');
  assert.equal(r.end, true);
  assert.equal(s.record().turns, 1);
});

test('booking: offers the booking link via SMS and creates a booking request', () => {
  const s = session(bizUser());
  const replies = talk(s, ['Can I book an appointment for a drain cleaning?', 'Friday at 10am', 'Alex Rivera', 'yes']);
  assert.equal(replies[0].asked, 'when');
  assert.equal(replies.at(-1).end, true);
  const types = s.record().actions.map(a => a.type);
  assert.deepEqual(types, ['book_request', 'send_sms']);
  assert.equal(s.record().slots.when, 'Friday 10am');
});

test('personal: delivery asks location, gives directions + gate instructions, hands off for OTP', () => {
  const user = personalUser({ deliveryAddress: { flat: 'Jasmine 77', building: 'Serene County', street: 'Telecom Nagar', city: 'Gachibowli, Hyderabad', landmark: 'Urdu University', securityNotes: 'Tell the guard you are delivering to Jasmine 77.' } });
  const s = session(user);
  const r1 = s.turn("Hi, I'm from Amazon with a package");
  assert.equal(r1.workflow.id, 'p_delivery');
  assert.equal(r1.asked, 'location');
  const r2 = s.turn('I am near the main road bus stop');
  assert.match(r2.say, /Urdu University/);
  assert.match(r2.say, /Jasmine 77, Serene County, Telecom Nagar/);
  assert.match(r2.say, /Before you go in: tell the guard/);
  assert.equal(r2.generate.kind, 'directions');
  assert.equal(r2.asked, 'needsCode');
  assert.equal(s.turn('yes I need the OTP').transfer, true);
});

test('personal: loan offer is negotiated down', () => {
  const s = session(personalUser());
  const r1 = s.turn('Hello sir, calling from Apex Bank about a pre-approved personal loan');
  assert.equal(r1.workflow.id, 'p_loan');
  assert.equal(r1.asked, 'amount');
  s.turn('5 lakh rupees');
  s.turn('14 percent');
  const r4 = s.turn('5 years');
  assert.match(r4.say, /14 percent is on the high side.*12 percent/);
  const r5 = s.turn('best I can do is 12.5 percent');
  assert.equal(r5.end, true);
  assert.match(r5.say, /12.5 percent/);
});

test('business: catalog lookup gives stock, unit price and total', () => {
  const user = bizUser();
  user.businessProfile.currency = 'INR';
  user.businessProfile.catalog = [{ name: '1200mm ceiling fan', stock: 8, price: 2450 }, { name: '9W LED bulb', stock: 0, price: 99 }];
  const s = session(user);
  const r = s.turn('Do you have 1200mm ceiling fans in stock? I need 3');
  assert.equal(r.workflow.id, 'product_inquiry');
  assert.match(r.say, /we have 8/);
  assert.match(r.say, /₹2,450/);
  assert.match(r.say, /₹7,350 in total/);
  assert.equal(r.asked, 'reserve');
  // spelled-out quantities, from the caller or from the model ("three")
  const s3 = session(user);
  assert.match(s3.turn('Do you have ceiling fans in stock? I need three.').say, /For 3, that comes to ₹7,350/);
  const s4 = session(user);
  assert.match(s4.turn('Do you have ceiling fans in stock?', { used: true, intent: 'product_inquiry', slots: { item: 'ceiling fans', quantity: 'three' } }).say, /For 3/);
  const s2 = session(user);
  assert.match(s2.turn('do you have LED bulbs available? need 10').say, /out of stock/);
});

test('personal: focus mode blocks transfer for unknown callers but not emergencies', () => {
  const focus = { inPriorityTime: true };
  const s = session(personalUser(), { priorityTimeInfo: focus });
  const r = talk(s, ["Hi it's Jordan", 'about the car you are selling', 'yes']).pop();
  assert.equal(r.transfer, false);
  const s2 = session(personalUser(), { priorityTimeInfo: focus });
  const r2 = talk(s2, ['This is Kim, there has been an accident, please, emergency', 'Dad fell and is going to hospital']);
  assert.ok(r2.some(r => r.transfer));
});

test('VIP is greeted by name and offered a transfer', () => {
  const s = session(personalUser({ vipContacts: [{ name: 'Mom', phoneNumber: '+15125550142' }] }), { vipContact: { name: 'Mom', phoneNumber: '+15125550142' } });
  s.greeting('Hi!');
  const r = s.turn('just wanted to ask about Sunday dinner');
  assert.equal(r.asked, 'putThrough');
  assert.equal(s.turn('yes please').transfer, true);
});

test('notes for next call are delivered in the greeting; always-transfer callers go straight through', () => {
  const s = session(bizUser(), { callerCtx: { callerName: 'Dana', instructions: [{ text: 'Your parts arrived' }] } });
  assert.match(s.greeting('Thanks for calling!').say, /Maria asked me to pass on a message: Your parts arrived\./);
  const s2 = session(bizUser(), { callerCtx: { callerName: 'Big Client', alwaysTransfer: true } });
  assert.equal(s2.greeting('Hi').transfer, true);
});

test('aggressive shield routes unrecognised high-risk callers to spam flow', () => {
  const s = session(bizUser({ shield: { mode: 'aggressive' } }), { risk: { score: 75, level: 'high' } });
  assert.equal(s.turn('hello is this the owner').workflow.id, 'sales_shutdown');
});

test('repeated non-answers fall back to a message instead of looping', () => {
  const s = session(personalUser());
  const r = talk(s, ['hello?', 'um', 'what', 'hmm']).pop();
  assert.equal(r.end, true);
});

test('Ask Vexa grammar: notes, focus, block, brief', async () => {
  const { parseOffline } = await import('../src/services/assistantService.js');
  const now = new Date('2026-03-04T15:00:00');
  assert.deepEqual(parseOffline('Tell Dana her parts arrived', now)[0], { type: 'note', who: 'Dana', phone: null, text: 'Your parts arrived', once: true });
  assert.equal(parseOffline('Tell Mom I will call after my meeting', now)[0].type, 'note');
  const f = parseOffline('Focus for 2 hours', now)[0];
  assert.equal(f.mode, 'focus');
  assert.equal(new Date(f.until).getTime() - now.getTime(), 2 * 3600000);
  assert.equal(parseOffline('Block +1 800 555 0199', now)[0].phone, '+18005550199');
  assert.equal(parseOffline('what did I miss?', now)[0].type, 'brief');
  assert.equal(parseOffline('Turn off the job applicant flow', now)[0].enabled, false);
  assert.equal(parseOffline('Always put Mom straight through', now)[0].type, 'always_transfer');
});

test('offline: "it\'s Marco" is a name; "till 6" is 6pm in the owner\'s timezone', async () => {
  assert.equal(extractName("could someone come thursday? it's Marco by the way", false).value, 'Marco');
  assert.equal(extractName("it's Thursday", false), null);
  const { parseOffline } = await import('../src/services/assistantService.js');
  const a = parseOffline("I'm heading into surgery, nobody bothers me till 6", new Date('2026-10-02T15:00:00Z'), 'America/Chicago')[0];
  assert.equal(a.mode, 'focus');
  assert.equal(a.until, '2026-10-02T23:00:00.000Z'); // 6pm CDT
});

test('a name the caller states overrides the remembered name', () => {
  const s = session(bizUser(), { callerCtx: { callerName: 'Priya Raman' } });
  const r = s.turn("Hi, this is Marco, I need a quote for a new toilet tomorrow");
  assert.equal(r.slots.name.value, 'Marco');
});

test('switching to Emergency uses the triggering sentence as the problem', () => {
  const s = session(bizUser());
  s.turn('I wanted to book a drain cleaning for next week');
  const r = s.turn('water is pouring out from under the sink', { used: true, emergency: true, slots: {} });
  assert.equal(r.workflow.id, 'emergency');
  assert.equal(r.asked, 'address');
  assert.match(r.slots.problem.value, /pouring/);
});
