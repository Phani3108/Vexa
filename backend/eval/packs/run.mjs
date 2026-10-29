/**
 * Business pack + scam shield eval.
 *
 * Each case is a whole call: a pack's sample business (or a personal account),
 * a caller number, and the caller's lines in order. The real engine answers
 * every line; the case then checks which flow ran, how the call ended, which
 * actions fired, what Vexa said (and must never say), refusals, and the scam verdict.
 *
 *   npm run eval:packs                         # offline (free, deterministic)
 *   npm run eval:packs -- --mode claude        # with the model (uses ANTHROPIC_API_KEY; costs money)
 *   npm run eval:packs -- --pack scam --verbose
 *   npm run eval:packs -- --min 1              # exit 1 below this pass rate (CI)
 *
 * Cases live in eval/packs/<pack>/cases.jsonl. Scam metrics: precision and recall
 * of the scam verdict, and leaks (the owner's phone, address or UPI ID spoken on a scam call).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
const flag = (name) => process.argv.includes(`--${name}`);
const MODE = arg('mode', 'offline');
const ONLY = arg('pack', null);
const MIN = arg('min', null);
const VERBOSE = flag('verbose');

if (MODE === 'claude') dotenv.config({ path: path.join(here, '../../.env'), quiet: true });
else { delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; }

const { WorkflowSession } = await import('../../src/workflows/engine.js');
const { defaultWorkflows } = await import('../../src/workflows/templates.js');
const { PACKS, packUpdate } = await import('../../src/packs/index.js');
const { understand, nluAvailable } = await import('../../src/workflows/nlu.js');

if (MODE === 'claude' && !nluAvailable()) { console.error('--mode claude needs ANTHROPIC_API_KEY in backend/.env'); process.exit(1); }

const NOW = new Date('2026-03-04T15:00:00');   // a Wednesday afternoon: every sample business is open
const OWNER_PHONE = '+919000000000';

function userFor(c) {
  if (c.user === 'personal') {
    return { accountType: 'personal', name: 'Phani Kumar', phoneNumber: OWNER_PHONE, escalationKeywords: ['emergency', 'hospital'], callCategories: [], deliveryAddress: { flat: 'Flat 302', street: 'Green Park, Kondapur', city: 'Hyderabad' }, workflows: defaultWorkflows('personal') };
  }
  const pack = PACKS[c.pack];
  if (!pack) throw new Error(`${c.id}: unknown pack ${c.pack}`);
  const u = { name: 'Phani Kumar', phoneNumber: OWNER_PHONE, callCategories: [], escalationKeywords: ['emergency'], ...packUpdate({}, pack, { sampleData: true }) };
  u.businessProfile = { ...u.businessProfile, timezone: 'UTC', transferNumber: '+919000000001' };
  return u;
}

function loadCases() {
  const cases = [];
  for (const dir of fs.readdirSync(here, { withFileTypes: true })) {
    if (!dir.isDirectory() || (ONLY && dir.name !== ONLY)) continue;
    const file = path.join(here, dir.name, 'cases.jsonl');
    if (!fs.existsSync(file)) continue;
    for (const [i, line] of fs.readFileSync(file, 'utf8').split('\n').entries()) {
      if (!line.trim()) continue;
      try { cases.push({ set: dir.name, ...JSON.parse(line) }); } catch (e) { throw new Error(`${file}:${i + 1}: ${e.message}`); }
    }
  }
  return cases;
}

async function runCase(c) {
  const user = userFor(c);
  const s = new WorkflowSession({ user, callerNumber: c.caller || '+919876500000', now: () => NOW, businessHours: { configured: true, open: true } });
  const said = [];
  for (const line of c.turns) {
    const nlu = MODE === 'claude' ? await understand(s, line, { timeout: 15000 }).catch(() => null) : null;
    const r = s.turn(line, nlu);
    said.push(r.say);
    if (r.end) break;
  }
  const rec = s.record();
  const text = said.join(' \n ');
  const e = c.expect || {};
  const fails = [];
  if (e.flow && rec.workflowId !== e.flow) fails.push(`flow ${rec.workflowId} ≠ ${e.flow}`);
  if (e.status && rec.status !== e.status) fails.push(`status ${rec.status} ≠ ${e.status}`);
  if (e.actions) {
    const got = rec.actions.map(a => a.type);
    for (const a of e.actions) if (!got.includes(a)) fails.push(`missing action ${a} (got ${got.join(',') || 'none'})`);
  }
  if (e.noActions) for (const a of e.noActions) if (rec.actions.some(x => x.type === a)) fails.push(`unexpected action ${a}`);
  for (const p of e.say || []) if (!new RegExp(p, 'i').test(text)) fails.push(`never said /${p}/`);
  for (const p of e.notSay || []) if (new RegExp(p, 'i').test(text)) fails.push(`said forbidden /${p}/`);
  const refused = rec.events.filter(ev => ev.type === 'refused').map(ev => ev.rule);
  if (e.refused !== undefined) {
    if (e.refused && !refused.includes(e.refused)) fails.push(`no refusal ${e.refused}`);
    if (!e.refused && refused.length) fails.push(`unexpected refusal ${refused.join(',')}`);
  }
  if (e.slots) for (const [k, v] of Object.entries(e.slots)) {
    const got = JSON.stringify(rec.slots[k]);
    if (!new RegExp(v, 'i').test(got ?? '')) fails.push(`slot ${k}=${got} !~ /${v}/`);
  }
  const scam = rec.scam?.type || null;
  if (e.scam !== undefined && (e.scam === true ? !scam : e.scam === false || e.scam === null ? !!scam : scam !== e.scam)) fails.push(`scam ${scam} ≠ ${e.scam}`);
  // Never leak the owner's details on a scam call
  let leak = false;
  if (scam) {
    const p = user.businessProfile || {};
    const secrets = [user.phoneNumber, user.phoneNumber?.slice(-10), p.address, p.upiId, user.deliveryAddress?.flat].filter(Boolean);
    leak = secrets.some(x => text.includes(x));
    if (leak) fails.push('leaked owner details on a scam call');
  }
  return { c, rec, text, fails, scam, leak };
}

const cases = loadCases();
if (!cases.length) { console.error('No cases found'); process.exit(1); }
const results = [];
for (const c of cases) results.push(await runCase(c));

const bySet = {};
for (const r of results) {
  const b = bySet[r.c.set] ||= { pass: 0, total: 0 };
  b.total++; if (!r.fails.length) b.pass++;
  if (r.fails.length || VERBOSE) {
    console.log(`${r.fails.length ? '✗' : '✓'} ${r.c.id}  ${r.c.turns[0].slice(0, 70)}`);
    for (const f of r.fails) console.log(`    – ${f}`);
    if (VERBOSE || r.fails.length) console.log(`    Vexa: ${r.text.replace(/\s+/g, ' ').slice(0, 400)}`);
  }
}

// Scam verdict quality across every case that states an expectation
const judged = results.filter(r => r.c.expect?.scam !== undefined);
const tp = judged.filter(r => r.scam && r.c.expect.scam).length;
const fp = judged.filter(r => r.scam && !r.c.expect.scam).length;
const fn = judged.filter(r => !r.scam && r.c.expect.scam).length;
const leaks = results.filter(r => r.leak).length;

const passed = results.filter(r => !r.fails.length).length;
const rate = passed / results.length;
console.log(`\nMode: ${MODE}`);
for (const [set, b] of Object.entries(bySet)) console.log(`  ${set.padEnd(14)} ${b.pass}/${b.total}`);
if (judged.length) console.log(`  scam verdicts  precision ${tp + fp ? (tp / (tp + fp)).toFixed(3) : '—'} · recall ${tp + fn ? (tp / (tp + fn)).toFixed(3) : '—'} · leaks ${leaks}`);
console.log(`Overall: ${passed}/${results.length} (${(rate * 100).toFixed(1)}%)`);

if (MIN != null && (rate < Number(MIN) || leaks > 0)) {
  console.error(`Below the gate: pass rate ${rate.toFixed(3)} < ${MIN}${leaks ? ` or ${leaks} leak(s)` : ''}`);
  process.exit(1);
}
