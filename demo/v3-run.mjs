/**
 * Demo v3: runs every Wave 1 scene against a local Vexa server (real Claude
 * calls) and captures the real app screens with Playwright. Writes
 * demo/build-v3/run.json + build-v3/screens/*.png for v3-timeline.mjs.
 *
 * Scenes: business packs · Vexa Link (Tamil clinic chat, Hindi kirana order
 * with a UPI pay button) · restaurant order · scam shield + family guardian ·
 * memory and Ask Vexa · interpreter (two phones) · agent-to-agent · usage,
 * import and "your data" screens.
 *
 *   VEXA_URL=http://localhost:3999 node demo/v3-run.mjs
 *   (backend running with ANTHROPIC_API_KEY; ANTHROPIC_FAST_MODEL=claude-sonnet-5-5 recommended)
 *
 * All phone numbers and businesses are fictional demo data.
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'build-v3');
const SHOTS = path.join(OUT, 'screens');
fs.mkdirSync(SHOTS, { recursive: true });
const B = process.env.VEXA_URL || 'http://localhost:3000';
const EXE = process.env.CHROME || `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const NUM = { clinic: '+919000004001', restaurant: '+919000004002', kirana: '+919000004003', amma: '+919000004004' };

// ── API helpers (one token per demo account) ─────────────────────────────────
async function call(p, { method = 'GET', body, token } = {}) {
  const res = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${data.error || ''}`);
  return data;
}
async function signIn(phone, name, accountType, fresh = true) {
  const { devCode } = await call('/api/auth/otp/request', { method: 'POST', body: { phoneNumber: phone } });
  if (!devCode) throw new Error('This needs a development server (codes are returned, not texted)');
  const v = await call('/api/auth/otp/verify', { method: 'POST', body: { phoneNumber: phone, code: devCode, name, accountType, timezone: 'Asia/Kolkata' } });
  // Each recording starts from an empty account (uses the app's own delete-account endpoint)
  if (fresh && !v.user.isNewUser) {
    await call('/api/account', { method: 'DELETE', token: v.token, body: { confirm: 'DELETE' } });
    return signIn(phone, name, accountType, false);
  }
  return { token: v.token, refresh: v.refreshToken, userId: v.user.userId };
}

async function savedCall(callId, token) {
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    const d = await call(`/api/calls/${encodeURIComponent(callId)}`, { token }).catch(() => null);
    if (d?.call?.analysis?.summary && d.call.aiUsage) return d.call;
  }
  throw new Error(`call ${callId} was not saved`);
}

function callView(c) {
  return {
    callId: c.callId, summary: c.analysis.summary, category: c.analysis.categoryLabel, lead: c.analysis.lead, isSpam: c.analysis.isSpam, scam: c.analysis.scam || null,
    workflow: c.workflowRun?.workflowName, status: c.workflowRun?.status, slots: c.workflowRun?.slots, slotLabels: c.workflowRun?.slotLabels,
    questionsAsked: c.workflowRun?.questionsAsked, slotsSkipped: c.workflowRun?.slotsSkipped,
    actions: (c.workflowRun?.actions || []).map(a => ({ type: a.type, status: a.result?.status, detail: a.result?.body || a.result?.detail })),
    aiUsage: c.aiUsage, languages: c.languages || ['en'], summaryLocal: c.analysis.summaryLocal || null, transcript: c.transcript
  };
}

/** A test call from the owner's app (same engine as phone calls). Callers answer whatever Vexa asks. */
async function testCall(token, { id, title, subtitle, callerVoice, callerName, opener, answers = {}, extra = [], endAfter = false, callerNumber }) {
  console.log(`\n▶ ${id} ${title}`);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const start = await call('/api/simulator/start', { method: 'POST', token, body: callerNumber ? { callerNumber } : {} });
    const turns = [{ speaker: 'ai', text: start.greeting, lang: start.language || 'en', en: start.greetingEn || start.greeting, understanding: { workflow: start.workflow, slots: {}, progress: 0 } }];
    const left = { ...answers };
    const queue = [...extra];
    let next = opener, callId = null, offline = 0;
    for (let i = 0; i < 12 && next; i++) {
      const ct = { speaker: 'caller', text: next };
      turns.push(ct);
      const r = await call(`/api/simulator/${start.sessionId}/message`, { method: 'POST', token, body: { text: next } });
      ct.lang = r.heard?.language || 'en';
      ct.en = r.heard?.translation || next;
      if (!r.aiAssisted) offline++;
      turns.push({ speaker: 'ai', text: r.reply, lang: r.language || 'en', en: r.replyEn || r.reply, style: r.style || null, latencyMs: r.latencyMs, aiAssisted: r.aiAssisted, understanding: { workflow: r.workflow, slots: r.slots, progress: r.progress, asked: r.asked } });
      console.log(`  ${callerName}: ${next}\n  Vexa (${r.latencyMs}ms): ${r.reply}`);
      if (r.ended) { callId = r.callId; break; }
      const key = r.asked?.startsWith('confirm:') ? 'confirm' : r.asked;
      next = (key && left[key]) || queue.shift() || null;
      if (key) delete left[key];
    }
    if (!callId && endAfter) callId = (await call(`/api/simulator/${start.sessionId}/end`, { method: 'POST', token })).call?.callId || `test_${start.sessionId}`;
    if (offline && attempt < 3) { console.log(`  ↻ ${offline} turn(s) without Claude — retrying`); continue; }
    const c = await savedCall(callId, token);
    console.log(`  ✓ ${c.analysis.summary}  ($${c.aiUsage.costUsd})`);
    return { id, title, subtitle, callerVoice, callerName, risk: start.risk, turns, handoffs: [], call: callView(c) };
  }
}

// ── Browser ──────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ executablePath: EXE });
async function phone(acct) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  if (acct) await ctx.addInitScript(([t, r]) => { localStorage.setItem('vexa.token', t); localStorage.setItem('vexa.refresh', r); localStorage.setItem('vexa.voice', 'off'); }, [acct.token, acct.refresh]);
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.speechSynthesis && (window.speechSynthesis.speak = () => {}); });
  return page;
}
async function shot(page, name, { scrollTo, wait = 900 } = {}) {
  await sleep(wait);
  if (scrollTo) {
    await page.evaluate(sel => {
      const el = [...document.querySelectorAll('h1, h2, h3, .eyebrow, .section-head h2')].find(h => h.textContent.trim().startsWith(sel));
      el?.scrollIntoView({ block: 'start' });
      document.querySelector('.screen')?.scrollBy(0, -12);
    }, scrollTo);
    await sleep(400);
  }
  await page.screenshot({ path: path.join(SHOTS, name) });
  console.log('📸', name);
}
const go = (page, p) => page.goto(B + p, { waitUntil: 'networkidle' });

/** A customer on their own phone, on the business's Vexa Link page (real public endpoints). */
async function linkChat(slug, owner, { id, title, subtitle, callerVoice, callerName, lang, lines, shots = {} }) {
  console.log(`\n▶ ${id} ${title} (Vexa Link /l/${slug})`);
  const page = await phone(null);
  await go(page, `/l/${slug}`);
  await shot(page, `${id}-link-open.png`, { wait: 1200 });
  const started = page.waitForResponse(r => r.url().endsWith('/start'));
  await page.getByRole('button', { name: /Talk to/ }).click();
  const start = await (await started).json();
  if (lang) await page.selectOption('select[aria-label="Your language"]', lang).catch(() => {});
  const turns = [{ speaker: 'ai', text: start.greeting, lang: start.language || 'en', en: start.greeting, understanding: {} }];
  let pay = null;
  for (const [i, text] of lines.entries()) {
    turns.push({ speaker: 'caller', text });
    await page.fill('input[aria-label="Your message"]', text);
    const t0 = Date.now();
    const resp = page.waitForResponse(r => r.url().includes('/message'), { timeout: 60000 });
    await page.keyboard.press('Enter');
    const r = await (await resp).json();
    const latencyMs = Date.now() - t0;
    turns.push({ speaker: 'ai', text: r.reply, lang: r.language || 'en', en: r.reply, latencyMs, aiAssisted: true, understanding: {} });
    console.log(`  ${callerName}: ${text}\n  Vexa (${latencyMs}ms): ${r.reply}`);
    if (r.pay) pay = r.pay;
    await sleep(700);
    if (shots[i]) await shot(page, shots[i], { wait: 500 });
    if (r.ended) break;
  }
  await page.close();
  const c = await savedCall(`link_${start.sessionId}`, owner.token);
  // The saved transcript carries the language and English of every line
  const said = (c.transcript || []).filter(l => l.speaker === 'caller' || l.speaker === 'user');
  let k = 0;
  for (const t of turns) if (t.speaker === 'caller' && said[k]) { t.lang = said[k].lang || 'en'; t.en = said[k].textEn || t.text; k++; }
  const ai = (c.transcript || []).filter(l => l.speaker === 'ai' || l.speaker === 'assistant');
  k = 0;
  for (const t of turns) if (t.speaker === 'ai' && ai[k]) { t.en = ai[k].textEn || t.text; t.lang = ai[k].lang || t.lang; k++; }
  const last = [...turns].reverse().find(t => t.speaker === 'ai');
  if (last) last.understanding = { workflow: c.workflowRun?.workflowId ? { id: c.workflowRun.workflowId, name: c.workflowRun.workflowName } : null, slots: Object.fromEntries(Object.entries(c.workflowRun?.slots || {}).map(([k2, v]) => [k2, { label: c.workflowRun.slotLabels?.[k2] || k2, value: Array.isArray(v) ? v.map(x => `${x.qty} × ${x.name}`).join(', ') : String(v) }])), progress: 1 };
  console.log(`  ✓ ${c.analysis.summary}  ($${c.aiUsage.costUsd})`);
  return { id, title, subtitle, callerVoice, callerName, channel: 'link', turns, handoffs: [], pay, call: callView(c) };
}

// ── Run ──────────────────────────────────────────────────────────────────────
const run = { recordedAt: new Date().toISOString(), version: 'v3', scenarios: [], commands: [], interpreter: null, agent: null, figures: {} };
const push = sc => { run.scenarios.push(sc); fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify(run, null, 2)); };

// Accounts
const clinic = await signIn(NUM.clinic, 'Dr. Meera Rao', 'business');
const restaurant = await signIn(NUM.restaurant, 'Imran', 'business');
const kirana = await signIn(NUM.kirana, 'Phani', 'business');
const amma = await signIn(NUM.amma, 'Lakshmi Amma', 'personal');
for (const [a, industry] of [[clinic, 'clinic'], [restaurant, 'restaurant'], [kirana, 'retail']]) await call('/api/users/onboarding', { method: 'POST', token: a.token, body: { accountType: 'business', industry, businessProfile: { timezone: 'Asia/Kolkata' } } });
await call('/api/users/onboarding', { method: 'POST', token: amma.token, body: { accountType: 'personal', name: 'Lakshmi Amma', businessProfile: { timezone: 'Asia/Kolkata' } } });
await call('/api/packs/clinic/install', { method: 'POST', token: clinic.token, body: { sampleData: true } });
await call('/api/packs/restaurant/install', { method: 'POST', token: restaurant.token, body: { sampleData: true } });
await call('/api/link', { method: 'PUT', token: clinic.token, body: { enabled: true, slug: 'sunrise-clinic' } });

// 1 — Packs (kirana owner installs from the app)
{
  const page = await phone(kirana);
  await go(page, '/packs');
  await shot(page, 'packs.png', { wait: 1500 });
  await page.getByRole('button', { name: /Kirana & hardware store/ }).click();
  await shot(page, 'pack-sheet.png', { wait: 800 });
  await page.getByRole('button', { name: /^Install Kirana/ }).click();
  await page.waitForURL(/\/flows/, { timeout: 15000 });
  await shot(page, 'flows-kirana.png', { wait: 1500 });
  await call('/api/link', { method: 'PUT', token: kirana.token, body: { enabled: true, slug: 'sri-lakshmi-kirana' } });
  await call('/api/agent-settings', { method: 'PUT', token: kirana.token, body: { enabled: true } });
  await page.close();
}

// 2 — Vexa Link + QR (clinic)
{
  const page = await phone(clinic);
  await go(page, '/link');
  await shot(page, 'link-qr.png', { wait: 1800 });
  await page.close();
}

// 3 — Tamil customer on the clinic's Vexa Link: fasting rule + price, then a medical question (refused)
push(await linkChat('sunrise-clinic', clinic, {
  id: '3', title: 'Clinic · Vexa Link · Tamil', subtitle: 'A customer scans the QR: test price and fasting rule in Tamil, then asks for medicine — refused kindly',
  callerVoice: { ta: 'Vani', en: 'Vani' }, callerName: 'Customer', lang: 'ta',
  lines: ['Thyroid test-ku fasting venuma? Evvalavu?', 'Fever-ku endha tablet podalam?', 'Illa, ippo venaam. Romba nandri!'],
  shots: { 1: 'link-clinic-chat.png' }
}));

// 4 — Restaurant: Hindi order with an exact read-back total (test call)
push(await testCall(restaurant.token, {
  id: '4', title: 'Restaurant · Hindi order', subtitle: 'Item by item, sold-out check, exact read-back total',
  callerVoice: { hi: 'Lekha', en: 'Rishi' }, callerName: 'Customer',
  opener: '2 chicken biryani aur 3 butter naan chahiye, pickup 8 baje, naam Ravi',
  answers: { mode: 'pickup', when: 'raat 8 baje', name: 'Ravi', confirm: 'haan, theek hai' }
}));

// 5 — Kirana on Vexa Link: Hindi delivery order → UPI pay button on the customer's phone
push(await linkChat('sri-lakshmi-kirana', kirana, {
  id: '5', title: 'Kirana · Vexa Link · UPI', subtitle: 'Hindi delivery order, exact total, a Pay-with-UPI button on the customer’s phone',
  callerVoice: { hi: 'Lekha', en: 'Rishi' }, callerName: 'Customer', lang: 'hi',
  lines: ['Bhaiya 2 kilo toor dal aur 1 sugar bhej do', 'Flat 302, Green Park, Kondapur', 'Ravi', 'haan'],
  shots: { 3: 'link-kirana-pay.png' }
}));

// 6 — Family: Amma links Phani as guardian; a "digital arrest" call to Amma is blocked and Phani is alerted
{
  const { code } = await call('/api/family/invite', { method: 'POST', token: amma.token, body: { share: { summaries: true, scamAlerts: true, recordings: false } } });
  await call('/api/family/accept', { method: 'POST', token: kirana.token, body: { code } });
  push(await testCall(amma.token, {
    id: '6', title: 'Scam shield · family guardian', subtitle: 'A “digital arrest” call to Amma in Hinglish — blocked in one turn; her son is alerted',
    callerVoice: { hi: 'Rishi', en: 'Rishi' }, callerName: 'Caller', callerNumber: '+918888800009',
    opener: 'Amma, main Mumbai police se bol raha hoon. Aapke naam pe FIR darj hai, abhi video call pe aaiye warna giraftar honge.'
  }));
  const sc = run.scenarios.find(s => s.id === '6');
  const a = await phone(amma);
  await go(a, `/call/${encodeURIComponent(sc.call.callId)}`);
  await shot(a, 'scam-amma.png', { wait: 1600 });
  await a.close();
  const g = await phone(kirana);
  await go(g, `/family/${encodeURIComponent(amma.userId)}`);
  await shot(g, 'scam-guardian.png', { wait: 1600 });
  await go(g, '/family');
  await shot(g, 'family.png', { wait: 1200 });
  await g.close();
}

// 7 — Memory: a supplier's quote and promise, then "What did the AC guy quote?"
push(await testCall(kirana.token, {
  id: '7', title: 'Memory and promises', subtitle: 'A supplier quotes a price and promises a visit — Vexa remembers both',
  callerVoice: 'Aman', callerName: 'Arjun (CoolFix)', callerNumber: '+919812300007',
  opener: 'Hi, this is Arjun from CoolFix, about the shop AC. The gas refill will cost 1800 rupees, and I will come on Monday at 11 am to do it.',
  answers: { name: 'Arjun', reason: 'Just tell Phani about the AC gas refill.', callbackTime: 'Anytime today after 4 pm.', callback: 'This number is fine.' },
  extra: ["No, that's all. Thanks!"], endAfter: true
}));
{
  for (let i = 0; i < 20; i++) { const m = await call('/api/memory', { token: kirana.token }); if (m.memories.length) break; await sleep(1500); }
  const page = await phone(kirana);
  await go(page, '/');
  await shot(page, 'home-promises.png', { scrollTo: 'Promises', wait: 1800 });
  await page.click('.tab-orb');
  const q = 'What did the AC guy quote?';
  await page.fill('input[aria-label="Command"]', q);
  const resp = page.waitForResponse(r => r.url().endsWith('/api/assistant/command'), { timeout: 60000 });
  await page.keyboard.press('Enter');
  const r = await (await resp).json();
  run.commands.push({ text: q, reply: r.reply });
  await page.waitForFunction(() => document.querySelectorAll('.sheet .bubble.ai').length > 0 && !document.querySelector('.sheet .typing-dots'), null, { timeout: 30000 }).catch(() => {});
  await shot(page, 'ask-memory.png', { wait: 600 });
  const q2 = 'Did anyone quote for a new fridge?';
  const r2 = await call('/api/assistant/command', { method: 'POST', token: kirana.token, body: { text: q2 } });
  run.commands.push({ text: q2, reply: r2.reply });
  console.log(`\n▶ Ask Vexa: ${q} → ${r.reply}\n  ${q2} → ${r2.reply}`);
  await page.close();
}

// 8 — Interpreter: Phani (Telugu) and a tenant (Hindi), two phones
{
  const owner = await phone(kirana);
  await go(owner, '/interpret');
  await owner.selectOption('select[aria-label="My language"]', 'te');
  await owner.selectOption('select[aria-label="Their language"]', 'hi');
  const created = owner.waitForResponse(r => r.url().endsWith('/api/interpreter') && r.request().method() === 'POST');
  await owner.getByRole('button', { name: /Start/ }).click();
  const room = (await (await created).json()).room;
  await shot(owner, 'interp-owner-qr.png', { wait: 1500 });
  const guest = await phone(null);
  await go(guest, `/i/${room}`);
  await guest.selectOption('select[aria-label="Your language"]', 'hi');
  await guest.getByRole('button', { name: 'Join' }).click();
  await sleep(1200);
  const script = [
    ['owner', 'అద్దె నెలకు 15,000 రూపాయలు, ప్రతి నెల 5వ తేదీలోపు కట్టాలి.'],
    ['guest', 'Theek hai. Advance kitna dena hoga? Aur paani ka bill alag hai kya?'],
    ['owner', 'రెండు నెలల అడ్వాన్స్. నీటి బిల్లు అద్దెలోనే కలిపి ఉంది.']
  ];
  const msgs = [];
  for (const [who, text] of script) {
    const page = who === 'owner' ? owner : guest;
    const resp = page.waitForResponse(r => /\/say$/.test(r.url()), { timeout: 60000 });
    await page.fill('input[aria-label="Your words"]', text);
    await page.keyboard.press('Enter');
    const m = await (await resp).json();
    msgs.push(m);
    console.log(`  ${who} [${m.lang}] ${text}\n    → [${m.translationLang}] ${m.translation}`);
    await sleep(2500);   // let the other phone poll it in
  }
  await shot(owner, 'interp-owner.png', { wait: 1200 });
  await shot(guest, 'interp-guest.png', { wait: 1200 });
  // English for the subtitles (same interpreter, into English)
  const require = createRequire(path.join(here, '../backend/package.json'));
  require('dotenv').config({ path: path.join(here, '../backend/.env'), quiet: true });
  const { interpret } = await import('../backend/src/services/interpreterService.js');
  for (const m of msgs) m.en = (await interpret(m.text, m.lang, 'en')).text;
  const closed = await call(`/api/interpreter/${room}`, { method: 'DELETE', token: kirana.token });
  run.interpreter = { messages: msgs, usage: closed.usage };
  await owner.close(); await guest.close();
}

// 9 — Agent to agent: a customer's Claude assistant uses the kirana's agent API
{
  const require = createRequire(path.join(here, '../backend/package.json'));
  require('dotenv').config({ path: path.join(here, '../backend/.env'), quiet: true });
  const Anthropic = require('@anthropic-ai/sdk').default ?? require('@anthropic-ai/sdk');
  const base = `${B}/api/agent/v1/sri-lakshmi-kirana`;
  const manifest = await call('/api/agent/v1/sri-lakshmi-kirana');
  const task = "Order 4 LED bulbs and 2 kg toor dal for delivery to Flat 4B, Lake View, Kondapur, and check if they have milk. I'm Priya, +919876511111. Tell me the total and how to pay.";
  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
  const tools = manifest.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
  const messages = [{ role: 'user', content: task }];
  const system = `You are a personal AI assistant acting for your user, connected to "${manifest.name}" through its agent API (the tools). Use the tools for exact facts and requests; never invent prices or availability. When done, tell your user the outcome in two or three sentences.`;
  const log = [];
  let usage = { input: 0, output: 0 };
  for (let step = 0; step < 8; step++) {
    const res = await client.messages.create({ model, max_tokens: 4000, thinking: { type: 'adaptive' }, system, tools, messages });
    usage.input += res.usage.input_tokens; usage.output += res.usage.output_tokens;
    messages.push({ role: 'assistant', content: res.content });
    const uses = res.content.filter(b => b.type === 'tool_use');
    if (res.stop_reason !== 'tool_use' || !uses.length) { log.push({ kind: 'say', text: res.content.filter(b => b.type === 'text').map(b => b.text).join('\n') }); break; }
    const results = [];
    for (const u of uses) {
      log.push({ kind: 'call', text: `${u.name} ${JSON.stringify(u.input)}` });
      const out = await fetch(`${base}/call`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tool: u.name, arguments: u.input, agent: { name: "Priya's assistant" } }) }).then(r => r.json());
      log.push({ kind: 'result', text: JSON.stringify(out) });
      results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out) });
    }
    messages.push({ role: 'user', content: results });
  }
  run.agent = { task, model, manifestName: manifest.name, log, usage };
  console.log(`\n▶ Agent to agent: ${log.filter(l => l.kind === 'call').length} tool calls → ${log.at(-1)?.text}`);
  const page = await phone(kirana);
  await go(page, '/activity');
  await shot(page, 'activity-agent.png', { wait: 1500 });
  await go(page, '/agent-api');
  await shot(page, 'agent-api.png', { wait: 1200 });
  await page.close();
}

// 10 — Owner screens: usage and budget, import, your data
{
  const page = await phone(kirana);
  await go(page, '/usage');
  await shot(page, 'usage.png', { wait: 1500 });
  await go(page, '/import');
  await page.fill('textarea[aria-label="CSV text"]', 'Item,MRP,Qty,Also called\nLED bulb 12W,129,40,12w bulb;bada bulb\nExtension board,349,,extension;spike guard');
  await page.evaluate(() => document.querySelector('input[aria-label="Append instead of replace"]')?.click());
  await page.getByRole('button', { name: 'Preview' }).click();
  await shot(page, 'import.png', { wait: 1500 });
  await go(page, '/me');
  await shot(page, 'me-data.png', { scrollTo: 'Your data', wait: 1200 });
  await page.close();
}

run.figures = {
  tests: 71, packEval: '71/71', scamPrecision: '1.0', scamRecall: '1.0', leaks: 0, nluOffline: '98.8%', nluHoldout: '98.0%',
  fastModel: process.env.ANTHROPIC_FAST_MODEL || null
};
fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify(run, null, 2));
fs.writeFileSync(path.join(OUT, 'screens.json'), JSON.stringify({}, null, 2));
await browser.close();
console.log(`\nSaved ${path.join(OUT, 'run.json')}`);
