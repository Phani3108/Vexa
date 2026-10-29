/**
 * Captures real app screens (phone size) for the video, logged in as the
 * demo account. Handoff prompts are triggered by real test calls so the
 * app receives the same live events it would on a phone.
 *
 *   node demo/capture-screens.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(here, 'build');
const SHOTS = path.join(BUILD, 'screens');
fs.mkdirSync(SHOTS, { recursive: true });
const B = 'http://localhost:3000';
const EXE = process.env.CHROME || `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const run = JSON.parse(fs.readFileSync(path.join(BUILD, 'run.json'), 'utf8'));
const S = Object.fromEntries(run.scenarios.map(s => [s.id, s]));
const AMMA = process.env.VEXA_AMMA || '+15550003099';
const OWNER = process.env.VEXA_OWNER || '+15550003077';

let token;
async function api(p, { method = 'GET', body } = {}) {
  const res = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${data.error || ''}`);
  return data;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const { devCode } = await api('/api/auth/otp/request', { method: 'POST', body: { phoneNumber: OWNER } });
const v = await api('/api/auth/otp/verify', { method: 'POST', body: { phoneNumber: OWNER, code: devCode } });
token = v.token;

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
await ctx.addInitScript(([t, r]) => { localStorage.setItem('vexa.token', t); localStorage.setItem('vexa.refresh', r); localStorage.setItem('vexa.voice', 'off'); }, [v.token, v.refreshToken]);
const page = await ctx.newPage();
const meta = {};

async function shot(name, { scrollTo, wait = 900 } = {}) {
  await sleep(wait);
  if (scrollTo) {
    await page.evaluate(sel => {
      const el = [...document.querySelectorAll('h2, h3, .section-head h2')].find(h => h.textContent.trim().startsWith(sel));
      el?.scrollIntoView({ block: 'start' });
      document.querySelector('.screen')?.scrollBy(0, -12);
    }, scrollTo);
    await sleep(400);
  }
  await page.screenshot({ path: path.join(SHOTS, name) });
  console.log('📸', name);
}

async function goto(p) {
  await page.goto(B + p, { waitUntil: 'networkidle' });
}

// ── Personal mode ───────────────────────────────────────────────────────────
await api('/api/users/mode', { method: 'POST', body: { accountType: 'personal' } });
await api('/api/assistant/shield', { method: 'PUT', body: { mode: 'standard' } });
await goto('/');
await shot('home-personal.png', { wait: 1500 });
// Same screen used for the "tap Business" moment; remember where the button is
const box = await page.locator('.mode-pill button', { hasText: 'Business' }).boundingBox();
meta.modeBusiness = { x: (box.x + box.width / 2) / 390, y: (box.y + box.height / 2) / 844 };
fs.copyFileSync(path.join(SHOTS, 'home-personal.png'), path.join(SHOTS, 'home-switch.png'));

// Handoff: delivery needs the OTP (real test call reaching the transfer)
const sim = await api('/api/simulator/start', { method: 'POST', body: {} });
for (const line of ["Hello, I'm calling from Swiggy. I have a food delivery for Phani.", "I'm in Gachibowli right now, near the main bus stop.", 'Yes, the customer has to share the OTP with me.']) {
  const r = await api(`/api/simulator/${sim.sessionId}/message`, { method: 'POST', body: { text: line } });
  if (r.ended) break;
}
await page.waitForSelector('.handoff', { timeout: 15000 });
await shot('handoff-delivery.png', { wait: 600 });
await page.click('button[aria-label="Let Vexa handle it"]');

// Ask Vexa: "busy until 7 pm"
await page.click('.tab-orb');
await page.fill('input[aria-label="Command"]', run.commands[0].text);
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.querySelectorAll('.sheet .bubble.ai').length > 0 && !document.querySelector('.sheet .typing-dots'), null, { timeout: 30000 });
await shot('ask-vexa.png', { wait: 500 });
await page.keyboard.press('Escape');

// Handoff: trusted contact calling during Focus (fires at call start)
await goto('/');
await sleep(1200);
await api('/api/simulator/start', { method: 'POST', body: { callerNumber: AMMA } });
await page.waitForSelector('.handoff', { timeout: 15000 });
await shot('handoff-vip.png', { wait: 600 });
await page.click('button[aria-label="Let Vexa handle it"]');

// Call details (personal)
await goto(`/call/${encodeURIComponent(S['2'].call.callId)}`);
await shot('call-loan.png', { scrollTo: 'What Vexa captured', wait: 1500 });
await goto(`/call/${encodeURIComponent(S['3'].call.callId)}`);
await shot('call-amma.png', { wait: 1500 });

// ── Switch to Business from Home (real tap) ────────────────────────────────
await api('/api/assistant/shield', { method: 'PUT', body: { mode: 'standard' } });
await goto('/');
await sleep(1200);
await page.click('.mode-pill button:has-text("Business")');
await page.waitForFunction(() => document.querySelector('.mode-pill button.on')?.textContent === 'Business', null, { timeout: 15000 });
await shot('home-business.png', { wait: 1500 });

await goto('/bookings');
await shot('bookings.png', { wait: 1200 });
await goto('/me/products');
await shot('products.png', { wait: 1200 });
await goto('/flows');
await shot('flows.png', { wait: 1500 });
await goto('/flows/product_inquiry');
await shot('flow-editor.png', { scrollTo: 'Steps', wait: 1500 });
await goto('/activity');
await shot('activity.png', { wait: 1500 });
await goto(`/call/${encodeURIComponent(S['4.c'].call.callId)}`);
await shot('call-fans.png', { scrollTo: 'What Vexa captured', wait: 1500 });

// ── Languages, bilingual transcripts and the call recording ────────────────
const scrollToSel = (sel) => page.evaluate(sel => { document.querySelector(sel)?.scrollIntoView({ block: 'start' }); document.querySelector('.screen')?.scrollBy(0, -16); }, sel);
if (S['6']?.call?.callId) {
  const ml = `/call/${encodeURIComponent(S['6'].call.callId)}`;
  await goto(ml);
  await shot('ml-summary.png', { wait: 1500 });
  await page.getByText(/Show transcript/).click();
  await sleep(500);
  await scrollToSel('select[aria-label="Read transcript in"]');
  await shot('ml-transcript.png', { wait: 500 });
  await page.selectOption('select[aria-label="Read transcript in"]', 'gu');
  await page.waitForFunction(() => !document.querySelector('select[aria-label="Read transcript in"]')?.disabled && document.querySelector('.bubble-lang')?.textContent.startsWith('Spoken'), null, { timeout: 60000 });
  await scrollToSel('.bubbles');
  await shot('ml-gujarati.png', { wait: 600 });
  await goto(ml);
  await sleep(1200);
  await page.getByText('Play recording').click();
  await sleep(900);
  await page.evaluate(() => { const a = document.querySelector('audio'); if (a) { a.pause(); a.currentTime = 6.2; } });
  await shot('ml-recording.png', { scrollTo: 'Recording', wait: 600 });
}
if (S['7']?.call?.callId) {
  await goto(`/call/${encodeURIComponent(S['7'].call.callId)}`);
  await sleep(1200);
  await page.getByText(/Show transcript/).click();
  await sleep(400);
  await scrollToSel('.bubbles');
  await shot('hinglish-transcript.png', { wait: 500 });
}
await goto('/me/voice');
await page.evaluate(() => [...document.querySelectorAll('label, .field')].find(e => /Greeting language/.test(e.textContent))?.scrollIntoView({ block: 'center' }));
await shot('settings-voice.png', { wait: 900 });
await goto('/me/recording');
await shot('settings-recording.png', { wait: 900 });

fs.writeFileSync(path.join(BUILD, 'screens.json'), JSON.stringify(meta, null, 2));
await browser.close();
console.log('done');
