/**
 * Indian-language understanding eval.
 *
 * Each case puts a fresh call into a known state (e.g. "Vexa just asked for a
 * time"), feeds one caller utterance through the real engine, and checks what
 * the engine captured: language, code-mixing, slot values, yes/no.
 *
 *   npm run eval:nlu                       # offline extractors only (free, deterministic)
 *   npm run eval:nlu -- --mode claude      # with the model (uses ANTHROPIC_API_KEY; costs money)
 *   npm run eval:nlu -- --cat yesno --verbose
 *   npm run eval:nlu -- --mode claude --out eval/nlu/results-claude.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
const flag = (name) => process.argv.includes(`--${name}`);
const MODE = arg('mode', 'offline');
const CAT = arg('cat', null);
const CONCURRENCY = Number(arg('concurrency', 6));
const VERBOSE = flag('verbose');

if (MODE === 'claude') dotenv.config({ path: path.join(here, '../../.env'), quiet: true });
else { delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; }

const { WorkflowSession } = await import('../../src/workflows/engine.js');
const { defaultWorkflows } = await import('../../src/workflows/templates.js');
const { buildIndustryTemplate } = await import('../../src/config/templates.js');
const { understand, nluAvailable } = await import('../../src/workflows/nlu.js');
const { analyzeLanguage } = await import('../../src/lib/language.js');
const { extractPhone } = await import('../../src/workflows/extractors.js');
const { newLedger, withLedger, summarize } = await import('../../src/lib/usage.js');

if (MODE === 'claude' && !nluAvailable()) { console.error('--mode claude needs ANTHROPIC_API_KEY in backend/.env'); process.exit(1); }

// ── Fixtures ────────────────────────────────────────────────────────────────
const tpl = buildIndustryTemplate('home_services');
const BUSINESS = {
  accountType: 'business', name: 'Phani', phoneNumber: '+919000000000',
  businessProfile: {
    ...tpl.businessProfile, businessName: 'Serene Home Essentials', currency: 'INR', timezone: 'Asia/Kolkata',
    address: 'Shop 4, Telecom Nagar Main Road, Gachibowli, Hyderabad',
    catalog: [
      { name: '1200mm ceiling fan', stock: 8, price: 2450, aliases: ['ceiling fan', 'fan', 'pankha'] },
      { name: '9W LED bulb', stock: 120, price: 99, aliases: ['led bulb', 'bulb'] }
    ]
  },
  callCategories: tpl.callCategories,
  workflows: defaultWorkflows('business')
};
const PERSONAL = { accountType: 'personal', name: 'Phani', phoneNumber: '+919000000000', workflows: defaultWorkflows('personal') };

// Setup turns are English and run offline, so every case starts from the same state.
const SETUPS = {
  'biz:open': { user: BUSINESS, turns: [] },
  'biz:when': { user: BUSINESS, turns: ['Hi, I would like to book an AC service'], asked: 'when' },
  'biz:name': { user: BUSINESS, turns: ['Hi, I would like to book an AC service', 'tomorrow 11am'], asked: 'name' },
  'biz:confirm': { user: BUSINESS, turns: ['Hi, I would like to book an AC service', 'tomorrow 11am', 'Ravi Kumar'], asked: /^confirm:/ },
  'biz:qty': { user: BUSINESS, turns: ['Do you have ceiling fans in stock?'], asked: 'quantity' },
  'per:open': { user: PERSONAL, turns: [] },
  'per:amount': { user: PERSONAL, turns: ['Hello sir, I am calling from HDFC Bank regarding a personal loan offer'], asked: 'amount' },
  'per:rate': { user: PERSONAL, turns: ['Hello sir, I am calling from HDFC Bank regarding a personal loan offer', 'five lakh'], asked: 'rate' }
};

function startSession(setup) {
  const s = new WorkflowSession({ user: setup.user, callerNumber: '+919876500000', businessHours: { configured: true, open: true } });
  for (const t of setup.turns) s.turn(t);
  const ok = !setup.asked || (setup.asked instanceof RegExp ? setup.asked.test(s.asked || '') : s.asked === setup.asked);
  if (!ok) throw new Error(`setup did not reach "${setup.asked}" (asked=${s.asked})`);
  return s;
}

// ── Matching ────────────────────────────────────────────────────────────────
const norm = (v) => String(v ?? '').toLowerCase()
  .replace(/a\.m\./g, 'am').replace(/p\.m\./g, 'pm')
  .replace(/(\d{1,2}):00\s*(am|pm)/g, '$1$2')
  .replace(/(\d)\s+(am|pm)\b/g, '$1$2')
  .replace(/[^\p{L}\p{N}:.\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/** "₹1,50,000", "1.5 lakh", "150000", "11.5%" → number */
function toNumber(v) {
  if (typeof v === 'number') return v;
  const t = String(v ?? '').toLowerCase().replace(/[₹,]|rs\.?|inr/g, '');
  const m = t.match(/(\d+(?:\.\d+)?)\s*(lakh|lac|lakhs|crore|cr|k|thousand)?/);
  if (!m) return NaN;
  const mult = { lakh: 1e5, lac: 1e5, lakhs: 1e5, crore: 1e7, cr: 1e7, k: 1e3, thousand: 1e3 }[m[2]] || 1;
  return Number(m[1]) * mult;
}

function slotMatches(slot, expected) {
  if (!slot) return false;
  if (typeof expected === 'number') {
    return [slot.value, slot.display].some(v => Math.abs(toNumber(v) - expected) < 0.01);
  }
  const hay = norm(`${slot.display} ${typeof slot.value === 'object' ? slot.value?.text || '' : slot.value}`);
  return norm(expected).split(' ').every(tok => new RegExp(`(^|\\s)${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(hay));
}


// ── Run one case ────────────────────────────────────────────────────────────
async function runCase(c) {
  const checks = [];
  const got = {};
  const ledger = newLedger();
  try {
    if (c.setup === 'unit:phone') {
      const p = extractPhone(c.text, { defaultCountry: '+91' });
      got.phone = p?.value || null;
      checks.push({ what: 'phone', ok: got.phone === c.expect.phone, want: c.expect.phone, got: got.phone });
      return { ...c, checks, got };
    }
    const s = startSession(SETUPS[c.setup]);
    const before = s.events.length;
    const nlu = MODE === 'claude' ? await withLedger(ledger, 'understanding', () => understand(s, c.text, { timeout: 30000 })) : null;
    if (MODE === 'claude' && !nlu) got.nluError = true;
    s.turn(c.text, nlu);
    const det = analyzeLanguage(c.text);
    got.lang = nlu?.language || det.lang;
    got.mixed = nlu ? nlu.codeMixed : det.mixed;
    const e = c.expect;
    if (e.lang) checks.push({ what: 'lang', ok: got.lang === e.lang, want: e.lang, got: got.lang });
    if (e.mixed !== undefined) checks.push({ what: 'mixed', ok: got.mixed === e.mixed, want: e.mixed, got: got.mixed ?? 'n/a' });
    for (const [key, want] of Object.entries(e.slots || {})) {
      const slot = s.slots[key];
      got[key] = slot ? slot.display : null;
      checks.push({ what: `slot:${key}`, ok: slotMatches(slot, want), want, got: got[key] });
    }
    if (e.confirm) {
      const evs = s.events.slice(before).map(x => x.type);
      got.confirm = evs.includes('confirmed') ? 'yes' : evs.includes('correction') ? 'no' : 'none';
      checks.push({ what: 'confirm', ok: got.confirm === e.confirm, want: e.confirm, got: got.confirm });
    }
  } catch (err) {
    checks.push({ what: 'error', ok: false, want: '-', got: err.message });
  }
  return { ...c, checks, got, usage: summarize(ledger) };
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

// ── Main ────────────────────────────────────────────────────────────────────
const cases = fs.readFileSync(path.join(here, arg('file', 'cases.jsonl')), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  .filter(c => !CAT || c.cat === CAT);
const t0 = Date.now();
const results = await pool(cases, MODE === 'claude' ? CONCURRENCY : 1, runCase);
const secs = ((Date.now() - t0) / 1000).toFixed(1);

const by = {};
const tally = (k, ok) => { by[k] ||= { pass: 0, total: 0 }; by[k].total++; if (ok) by[k].pass++; };
let casePass = 0;
for (const r of results) {
  const ok = r.checks.every(x => x.ok);
  if (ok) casePass++;
  tally(`cat:${r.cat}`, ok);
  for (const x of r.checks) tally(`check:${x.what.split(':')[0]}`, x.ok);
  if (VERBOSE || !ok) {
    const bad = r.checks.filter(x => !x.ok).map(x => `${x.what} want=${JSON.stringify(x.want)} got=${JSON.stringify(x.got)}`).join('; ');
    console.log(`${ok ? '✓' : '✗'} ${r.id.padEnd(9)} ${JSON.stringify(r.text).slice(0, 52).padEnd(54)} ${bad}`);
  }
}

const pct = (p, t) => `${((100 * p) / t).toFixed(0)}%`.padStart(4);
console.log(`\nMode: ${MODE}${MODE === 'claude' ? ` (${process.env.ANTHROPIC_FAST_MODEL || process.env.ANTHROPIC_MODEL || 'default model'})` : ''} · ${results.length} cases · ${secs}s`);
console.log('\nBy category (whole case passes)');
for (const [k, v] of Object.entries(by).filter(([k]) => k.startsWith('cat:')).sort()) console.log(`  ${k.slice(4).padEnd(16)} ${pct(v.pass, v.total)}  ${v.pass}/${v.total}`);
console.log('By check');
for (const [k, v] of Object.entries(by).filter(([k]) => k.startsWith('check:')).sort()) console.log(`  ${k.slice(6).padEnd(16)} ${pct(v.pass, v.total)}  ${v.pass}/${v.total}`);
console.log(`\nOverall: ${pct(casePass, results.length)} (${casePass}/${results.length})`);

if (MODE === 'claude') {
  const cost = results.reduce((a, r) => a + (r.usage?.costUsd || 0), 0);
  console.log(`Model cost: $${cost.toFixed(4)} · avg $${(cost / results.length).toFixed(5)}/utterance`);
}
const out = arg('out', null);
if (out) fs.writeFileSync(out, JSON.stringify({ mode: MODE, at: new Date().toISOString(), results }, null, 2));
