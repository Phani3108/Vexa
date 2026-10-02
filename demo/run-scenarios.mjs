/**
 * Runs the demo scenarios against the live Vexa API (real Claude calls) and
 * records everything the video needs into build/run.json:
 *   transcripts, what Vexa understood each turn, flow + actions, handoffs,
 *   latency, saved call (summary, lead) and per-call token usage/cost.
 *
 * Callers are scripted but adaptive: each caller answers whatever Vexa asked
 * (by the slot it asked for), so the conversations stay coherent.
 *
 *   node demo/run-scenarios.mjs        (backend must be running on :3000)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'build');
fs.mkdirSync(OUT, { recursive: true });
const B = process.env.VEXA_URL || 'http://localhost:3000';
const OWNER = '+15550001077';       // fictional demo account number
const AMMA = '+15550001099';        // fictional trusted contact

let token = null;
async function api(p, { method = 'GET', body } = {}) {
  const res = await fetch(B + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${data.error || ''}`);
  return data;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Account setup ───────────────────────────────────────────────────────────
async function setup() {
  const { devCode } = await api('/api/auth/otp/request', { method: 'POST', body: { phoneNumber: OWNER } });
  const v = await api('/api/auth/otp/verify', { method: 'POST', body: { phoneNumber: OWNER, code: devCode, timezone: 'Asia/Kolkata' } });
  token = v.token;

  await api('/api/users/onboarding', {
    method: 'POST',
    body: {
      accountType: 'personal',
      name: 'Phani',
      aiSettings: { voice: 'shimmer' },
      businessProfile: { timezone: 'Asia/Kolkata' },
      deliveryAddress: {
        flat: 'Jasmine 77',
        building: 'Serene County',
        street: 'Telecom Nagar',
        city: 'Gachibowli, Hyderabad',
        landmark: 'Urdu University (MANUU)',
        societyNotes: 'Serene County is the gated community near Urdu University in Telecom Nagar. Once you reach Telecom Nagar, ask for Serene County, then go to the Jasmine block, house number 77.',
        securityNotes: 'Tell the security guard at the main gate that you are delivering to Jasmine 77 for Phani, and sign the visitor register if they ask.'
      }
    }
  });
  await api('/api/users/vip-contacts', { method: 'PUT', body: { vipContacts: [{ name: 'Amma', phoneNumber: AMMA, relationship: 'mother' }] } });
  await api('/api/assistant/shield', { method: 'PUT', body: { mode: 'standard' } });

  // Business profile prepared up front so "switch to Business" is one tap on Home
  await api('/api/users/config', {
    method: 'PUT',
    body: {
      businessProfile: {
        businessName: 'Serene Home Essentials',
        industry: 'home_services',
        description: 'Household essentials store in Gachibowli with home services: AC servicing, plumbing and electrical work.',
        address: 'Shop 4, Telecom Nagar Main Road, Gachibowli, Hyderabad',
        directions: 'We are on the main road, a short walk from Urdu University. Look for the green Serene Home Essentials signboard; two-wheeler parking is right in front of the shop.',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        transferNumber: OWNER,
        services: ['AC servicing — ₹599', 'Plumber visit — ₹299', 'Electrician visit — ₹299', 'Ceiling fan installation — ₹249'],
        faqs: [
          { question: 'Do you deliver?', answer: 'Yes, free home delivery within 3 km for orders above ₹1,000.' },
          { question: 'Do you accept UPI?', answer: 'Yes, we accept UPI, cards and cash.' }
        ],
        hours: [0, 1, 2, 3, 4, 5, 6].map(day => (day === 0 ? { day, open: '10:00', close: '20:00', closed: false } : { day, open: '09:00', close: '23:30', closed: false })),
        catalog: [
          { name: '1200mm ceiling fan', stock: 8, price: 2450, aliases: ['ceiling fan', 'fan'] },
          { name: '9W LED bulb', stock: 120, price: 99, aliases: ['led bulb', 'bulb'] },
          { name: '1-inch PVC pipe (10 ft)', stock: 60, price: 185, unit: 'length', aliases: ['pvc pipe', 'pipe'] },
          { name: 'White wall paint, 4 litre', stock: 15, price: 1250, aliases: ['paint'] },
          { name: 'Water purifier filter cartridge', stock: 0, price: 650, aliases: ['filter', 'purifier'] }
        ]
      }
    }
  });
}

// ── One call ────────────────────────────────────────────────────────────────
async function runCall({ id, title, subtitle, callerVoice, callerName, callerNumber, opener, answers, extraLines = [] }) {
  console.log(`\n▶ ${id} ${title}`);
  const startedAt = Date.now();
  const start = await api('/api/simulator/start', { method: 'POST', body: callerNumber ? { callerNumber } : {} });
  const turns = [{ speaker: 'ai', text: start.greeting, understanding: { workflow: start.workflow, slots: {}, progress: 0 } }];
  console.log(`  AI: ${start.greeting}`);
  const handoffs = [];
  if (start.caller?.isVIP && start.inFocus) handoffs.push({ atTurn: 0, kind: 'vip' });

  let next = opener;
  let asked = null;
  let callId = null;
  const queue = [...extraLines];
  for (let i = 0; i < 12 && next; i++) {
    turns.push({ speaker: 'caller', text: next });
    console.log(`  ${callerName}: ${next}`);
    const r = await api(`/api/simulator/${start.sessionId}/message`, { method: 'POST', body: { text: next } });
    turns.push({
      speaker: 'ai',
      text: r.reply,
      latencyMs: r.latencyMs,
      aiAssisted: r.aiAssisted,
      understanding: { workflow: r.workflow, slots: r.slots, progress: r.progress, asked: r.asked }
    });
    console.log(`  AI (${r.latencyMs}ms${r.aiAssisted ? ', Claude' : ''}): ${r.reply}`);
    if (r.transferred) handoffs.push({ atTurn: turns.length - 1, kind: 'transfer' });
    if (r.ended) { callId = r.callId; break; }
    asked = r.asked;
    const key = asked?.startsWith('confirm:') ? 'confirm' : asked;
    next = (key && answers[key]) || queue.shift() || null;
    if (key && answers[key]) delete answers[key]; // answer each question once
  }

  // Background analysis → saved call with summary, outcomes and AI cost
  let call = null;
  for (let i = 0; i < 30 && callId; i++) {
    await sleep(1500);
    const d = await api(`/api/calls/${encodeURIComponent(callId)}`).catch(() => null);
    if (d?.call?.analysis?.summary && d.call.aiUsage) { call = d.call; break; }
  }
  console.log(`  ✓ ${call?.analysis?.summary}`);
  console.log(`  $ ${call?.aiUsage?.costUsd} (${call?.aiUsage?.inputTokens} in / ${call?.aiUsage?.outputTokens} out, ${call?.aiUsage?.requests} requests)`);
  return {
    id, title, subtitle, callerVoice, callerName,
    callerNumber: start.caller?.number,
    risk: start.risk,
    turns,
    handoffs,
    call: call && {
      callId: call.callId,
      summary: call.analysis.summary,
      category: call.analysis.categoryLabel,
      lead: call.analysis.lead,
      isSpam: call.analysis.isSpam,
      workflow: call.workflowRun?.workflowName,
      status: call.workflowRun?.status,
      slots: call.workflowRun?.slots,
      slotLabels: call.workflowRun?.slotLabels,
      questionsAsked: call.workflowRun?.questionsAsked,
      slotsSkipped: call.workflowRun?.slotsSkipped,
      actions: (call.workflowRun?.actions || []).map(a => ({ type: a.type, status: a.result?.status, detail: a.result?.body || a.result?.detail })),
      aiUsage: call.aiUsage
    },
    wallClockMs: Date.now() - startedAt
  };
}

// ONLY=3 node demo/run-scenarios.mjs → re-record just those scenarios and merge into run.json
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = id => !ONLY || ONLY.includes(id);

async function main() {
  const prev = ONLY && fs.existsSync(path.join(OUT, 'run.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'run.json'), 'utf8')) : null;
  if (ONLY) {
    const { devCode } = await api('/api/auth/otp/request', { method: 'POST', body: { phoneNumber: OWNER } });
    token = (await api('/api/auth/otp/verify', { method: 'POST', body: { phoneNumber: OWNER, code: devCode } })).token;
  } else {
    await setup();
  }
  const run = { recordedAt: new Date().toISOString(), timezone: 'Asia/Kolkata', owner: 'Phani', scenarios: [], commands: [], screens: {} };
  const push = (sc) => { run.scenarios.push(sc); };

  // 1 — Delivery with directions, security brief and OTP handoff
  if (want('1')) push(await runCall({
    id: '1', title: 'Delivery executive', subtitle: 'Directions to Jasmine 77 · security gate brief · OTP handoff to you',
    callerVoice: 'Aman', callerName: 'Delivery executive',
    opener: "Hello, I'm calling from Swiggy. I have a food delivery for Phani.",
    answers: {
      company: 'Swiggy.',
      location: "I'm in Gachibowli right now, near the main bus stop.",
      needsCode: 'Yes, the customer has to share the OTP with me.'
    }
  }));

  // 2 — Bank personal-loan call, negotiated down
  if (want('2')) push(await runCall({
    id: '2', title: 'Bank loan call', subtitle: 'Gets the offer details, asks rate and tenure, negotiates the rate down',
    callerVoice: 'Tara', callerName: 'Bank agent',
    opener: 'Good evening sir, this is Neha from Apex Bank. You have a pre-approved personal loan offer.',
    answers: {
      bank: 'Apex Bank.',
      product: "It's a personal loan, sir.",
      amount: 'Up to five lakh rupees.',
      rate: 'The interest rate is 14 percent per annum.',
      tenure: 'Five years, sir.',
      finalRate: 'Sir, the best I can do is 12.5 percent.'
    }
  }));

  // 3 — Trusted contact while busy until 7 PM
  if (want('3')) {
  if (ONLY) await api('/api/users/mode', { method: 'POST', body: { accountType: 'personal' } });
  const cmd = await api('/api/assistant/command', { method: 'POST', body: { text: "I'm busy with meetings, I'll be available after 7 pm today." } });
  console.log(`\n▶ Ask Vexa → ${cmd.reply}`);
  run.commands.push({ text: "I'm busy with meetings, I'll be available after 7 pm today.", reply: cmd.reply, aiUsage: cmd.aiUsage, parsedBy: cmd.parsedBy });
  push(await runCall({
    id: '3', title: 'Trusted contact (Amma)', subtitle: "You're in Focus — your app asks: pick up, or let Vexa handle it",
    callerVoice: 'Lekha', callerName: 'Amma', callerNumber: AMMA,
    opener: 'Hello, I wanted to talk to Phani about the family function this Sunday.',
    answers: {}
  }));
  await api('/api/assistant/shield', { method: 'PUT', body: { mode: 'standard' } });
  }

  // 4 — Switch to Business, then three customer calls
  const sw = await api('/api/users/mode', { method: 'POST', body: { accountType: 'business' } });
  console.log(`\n▶ Switched to ${sw.config.accountType} (${sw.config.businessProfile.businessName})`);

  if (want('4.a')) push(await runCall({
    id: '4.a', title: 'Appointment booking', subtitle: 'Books an AC service, confirms details, creates a booking request',
    callerVoice: 'Rishi', callerName: 'Customer',
    opener: "Hi, I'd like to book an AC service for tomorrow at 11 in the morning.",
    answers: { service: 'AC servicing.', when: 'Tomorrow at 11 AM.', name: "It's Ravi Kumar.", confirm: "Yes, that's right." }
  }));

  if (want('4.b')) push(await runCall({
    id: '4.b', title: 'Address & directions', subtitle: 'Gives the shop address, directions and Sunday hours',
    callerVoice: 'Tara', callerName: 'Customer',
    opener: 'Hi, where exactly is your shop? How do I get there?',
    answers: {},
    extraLines: ['Okay. And are you open on Sunday?', "No, that's all. Thank you!"]
  }));

  if (want('4.c')) push(await runCall({
    id: '4.c', title: 'Stock, price & total', subtitle: 'Checks stock, quotes unit price and total, reserves the order',
    callerVoice: 'Aman', callerName: 'Customer',
    opener: 'Do you have 1200 millimetre ceiling fans in stock? I need three.',
    answers: { reserve: 'Yes please, reserve them for me.', name: "It's Suresh.", quantity: 'Three.', item: '1200 millimetre ceiling fans.' }
  }));

  if (prev) {
    const merged = prev.scenarios.map(sc => run.scenarios.find(n => n.id === sc.id) || sc);
    run.scenarios = merged;
    run.commands = run.commands.length ? run.commands : prev.commands;
    run.recordedAt = prev.recordedAt;
  }
  fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify(run, null, 2));
  fs.writeFileSync(path.join(OUT, 'token.txt'), token);
  console.log(`\nSaved ${path.join(OUT, 'run.json')}`);
}

main().catch(err => { console.error(err); process.exit(1); });
