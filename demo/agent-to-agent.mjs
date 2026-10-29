/**
 * Agent-to-agent demo: a customer's own AI assistant (Claude) talks to a
 * business's Vexa through the callable agent API instead of phoning it.
 *
 * It reads the business's manifest, turns its tools into Claude tools, and
 * works on a plain-language task until done. Every tool call and result is
 * printed, so the demo shows exactly what crossed between the two agents.
 *
 *   node demo/agent-to-agent.mjs <business-url> "<task>"
 *   node demo/agent-to-agent.mjs http://localhost:3000/api/agent/v1/sri-lakshmi-kirana-hardware \
 *     "Order 4 LED bulbs and 2 kg toor dal for delivery to Flat 4B, Lake View, Kondapur. I'm Priya, +919876511111. Tell me the total."
 *
 * Uses ANTHROPIC_API_KEY from backend/.env (costs a few cents per run).
 */

import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../backend/package.json'));
require('dotenv').config({ path: path.join(here, '../backend/.env'), quiet: true });
const Anthropic = require('@anthropic-ai/sdk').default ?? require('@anthropic-ai/sdk');

const [url, ...taskWords] = process.argv.slice(2);
const task = taskWords.join(' ');
if (!url || !task) { console.error('Usage: node demo/agent-to-agent.mjs <business agent URL> "<task>"'); process.exit(1); }
if (!process.env.ANTHROPIC_API_KEY) { console.error('Set ANTHROPIC_API_KEY in backend/.env'); process.exit(1); }

const base = url.replace(/\/+$/, '');
const manifest = await (await fetch(base)).json();
if (!manifest.tools) { console.error(`No agent manifest at ${base}: ${JSON.stringify(manifest)}`); process.exit(1); }

const dim = s => `\x1b[2m${s}\x1b[0m`;
const bold = s => `\x1b[1m${s}\x1b[0m`;
console.log(bold(`\nCustomer's assistant → ${manifest.name}`));
console.log(dim(`Policy: ${manifest.policy}`));
console.log(dim(`Tools: ${manifest.tools.map(t => t.name).join(', ')}\n`));
console.log(`${bold('Task:')} ${task}\n`);

const client = new Anthropic();
const tools = manifest.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
const messages = [{ role: 'user', content: task }];
const system = `You are a personal AI assistant acting for your user. You are connected to "${manifest.name}" through its agent API (the tools). Use the tools to get exact facts and to place requests; never invent prices or availability. Bookings and orders are requests the business confirms. Never send OTPs, card or bank details. When done, tell your user the outcome in two or three sentences.`;

for (let step = 0; step < 8; step++) {
  const res = await client.messages.create({ model: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5', max_tokens: 4000, thinking: { type: 'adaptive' }, system, tools, messages });
  messages.push({ role: 'assistant', content: res.content });
  const calls = res.content.filter(b => b.type === 'tool_use');
  if (res.stop_reason !== 'tool_use' || !calls.length) {
    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    console.log(`${bold('Assistant → user:')} ${text}\n`);
    break;
  }
  const results = [];
  for (const c of calls) {
    console.log(`${bold('→ ' + c.name)} ${dim(JSON.stringify(c.input))}`);
    const r = await fetch(`${base}/call`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tool: c.name, arguments: c.input, agent: { name: "Priya's assistant" } }) });
    const body = await r.json();
    console.log(`${bold('← ' + manifest.name)} ${dim(JSON.stringify(body).slice(0, 400))}\n`);
    results.push({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(body), ...(r.ok ? {} : { is_error: true }) });
  }
  messages.push({ role: 'user', content: results });
}
