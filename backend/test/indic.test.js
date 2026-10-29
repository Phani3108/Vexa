import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const { parseIndianNumber, yesNo, isBackchannel, normalizeDigits } = await import('../src/lib/indic.js');
const { analyzeLanguage } = await import('../src/lib/language.js');
const { extractDateTime, extractNumber, extractQuantity, extractAmount, extractPhone, extractName } = await import('../src/workflows/extractors.js');
const { WorkflowSession } = await import('../src/workflows/engine.js');
const { defaultWorkflows } = await import('../src/workflows/templates.js');

const NOW = new Date('2026-03-04T15:00:00'); // Wednesday afternoon
const when = (t) => extractDateTime(t, true, NOW)?.display;

test('Indian numbers: lakh/crore, dedh/dhai/saade, number words in six languages, native digits', () => {
  assert.equal(parseIndianNumber('dedh lakh ka loan').value, 150000);
  assert.equal(parseIndianNumber('ek crore').value, 10000000);
  assert.equal(parseIndianNumber('Rs 2,50,000').value, 250000);
  assert.equal(parseIndianNumber('saade gyarah percent').value, 11.5);
  assert.equal(extractNumber('padi kavali').value, 10);
  assert.equal(extractNumber('moonu').value, 3);
  assert.equal(extractNumber('रेंडु'), null); // unknown word → nothing, no crash
  assert.equal(extractNumber('పది').value, 10);
  assert.equal(normalizeDigits('११ बजे'), '11 बजे');
  assert.equal(extractQuantity('bhaiya LED bulb hai kya? dus chahiye').value, 10);
  assert.equal(extractAmount('dhai lakh', true).display, '₹2,50,000');
  // English "do you have…" is not the number two
  assert.equal(parseIndianNumber('do you have fans'), null);
});

test('Indian dates and times', () => {
  assert.equal(when('kal shaam 5 baje'), 'tomorrow 5pm');
  assert.equal(when('parso subah 9 baje'), 'day after tomorrow 9am');
  assert.equal(when('day after tomorrow 11am'), 'day after tomorrow 11am');
  assert.equal(when('repu saayantram 5 gantalaki'), 'tomorrow 5pm');
  assert.equal(when('naalaikku kaalaila 10 manikku'), 'tomorrow 10am');
  assert.equal(when('kal subah saade das baje'), 'tomorrow 10:30am');
  assert.equal(when('paune das baje kal'), 'tomorrow 9:45am');
  assert.equal(when('raat 9 baje'), '9pm');
  assert.equal(when('evening 5 o\'clock'), '5pm');
  assert.equal(when('half past three tomorrow'), 'tomorrow 3:30pm');
  assert.equal(when('quarter to eleven tomorrow morning'), 'tomorrow 10:45am');
  assert.equal(when('రేపు ఉదయం 11 గంటలకు'), 'tomorrow 11am');
  assert.equal(when('mañana a las 11 de la mañana'), 'tomorrow 11am');
  assert.equal(when('somvar subah'), 'Monday morning');
});

test('yes / no in every supported language, with polite endings', () => {
  for (const y of ['haan ji', 'theek hai', 'avunu', 'sare andi', 'aamaa', 'athe', 'ho, barobar aahe', 'ha, barabar che', 'हाँ जी', 'అవును', 'hmm haan', 'avunandi']) assert.equal(yesNo(y), true, y);
  for (const n of ['nahi ji, galat hai', 'ledu', 'vaddu', 'illa', 'illainga', 'venda', 'alla', 'nako', 'na, khotu che', 'नहीं', 'இல்லைங்க']) assert.equal(yesNo(n), false, n);
  assert.equal(yesNo('naaku repu kavali'), null);
});

test('romanized Indian languages and code-mixing are detected', () => {
  assert.deepEqual(analyzeLanguage('kal subah 11 baje AC service chahiye'), { lang: 'hi', mixed: true, script: 'latin' });
  assert.equal(analyzeLanguage('naaku repu kavali').lang, 'te');
  assert.equal(analyzeLanguage('randu bulb venam').lang, 'ml');
  assert.equal(analyzeLanguage('rendu podhum').lang, 'ta');
  assert.equal(analyzeLanguage('mala udya appointment pahije aahe').lang, 'mr');
  assert.equal(analyzeLanguage('mare kaale appointment joie che').lang, 'gu');
  assert.equal(analyzeLanguage('mera naam Ravi Kumar hai').mixed, false);
  assert.equal(analyzeLanguage('I am out of station, call me tomorrow').lang, 'en');
  assert.deepEqual(analyzeLanguage('నాకు రేపు 11 AM కి AC service కావాలి'), { lang: 'te', mixed: true, script: 'native' });
});

test('names, +91 phone numbers and backchannels', () => {
  assert.equal(extractName('mera naam Ravi Kumar hai', true).value, 'Ravi Kumar');
  assert.equal(extractName('ji, main Priya Sharma bol rahi hoon', true).value, 'Priya Sharma');
  assert.equal(extractName("It's Dana Smith", true).value, 'Dana Smith');
  assert.equal(extractPhone('double nine four eight triple five six seven eight').value, '+919948555678');
  assert.equal(extractPhone('0 98490 01234').value, '+919849001234');
  assert.equal(extractPhone('512 555 0199', { defaultCountry: '+1' }).value, '+15125550199');
  for (const b of ['haan', 'hmm', 'haan ji', 'achha', 'ok ok', 'సరే', 'ஆமா']) assert.equal(isBackchannel(b), true, b);
  for (const b of ['haan, kal 5 baje', 'nahi', 'wait wait, wrong address']) assert.equal(isBackchannel(b), false, b);
});

test('Indian-language openers reach the right flow without the model', () => {
  const user = {
    accountType: 'business', name: 'Phani', phoneNumber: '+919000000000',
    businessProfile: { businessName: 'Serene', currency: 'INR', catalog: [{ name: '9W LED bulb', stock: 120, price: 99, aliases: ['led bulb', 'bulb'] }] },
    workflows: defaultWorkflows('business')
  };
  const s = new WorkflowSession({ user, callerNumber: '+919876500000', businessHours: { configured: true, open: true } });
  const r = s.turn('LED bulbs unnaya? padi kavali');
  assert.equal(s.active.id, 'product_inquiry');
  assert.equal(s.slots.quantity.value, 10);
  assert.match(r.say, /₹990/);
});
