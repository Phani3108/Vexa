/** Writes output/COSTS.md from build/run.json (measured Claude usage per call). */
import fs from 'fs';

const run = JSON.parse(fs.readFileSync(new URL('./build/run.json', import.meta.url)));
const INR = 84;
const usd = n => `$${n.toFixed(4)}`;
const inr = n => `₹${(n * INR).toFixed(2)}`;
const tok = n => n.toLocaleString('en-US');
const LANG = { en: 'English', hi: 'Hindi', te: 'Telugu', ta: 'Tamil', ml: 'Malayalam', mr: 'Marathi', gu: 'Gujarati', es: 'Spanish' };

const rows = [];
for (const sc of run.scenarios) {
  const u = sc.call.aiUsage;
  const turns = sc.turns.filter(t => t.speaker === 'caller').length;
  const langs = (sc.call.languages || ['en']).map(l => LANG[l] || l).join(', ');
  rows.push({ id: sc.id, title: sc.title, turns, langs, ...u });
}
const extras = [];
if (run.commands?.[0]?.aiUsage) extras.push({ id: '3*', title: 'Ask Vexa: “busy until 7 PM”', turns: '—', langs: 'English', ...run.commands[0].aiUsage });
if (run.translation?.aiUsage) extras.push({ id: '6*', title: 'Read call 6 in Gujarati (on demand)', turns: '—', langs: 'Gujarati', ...run.translation.aiUsage });
const all = [...rows, ...extras];
const sum = k => all.reduce((a, r) => a + (r[k] || 0), 0);
const avg = rows.reduce((a, r) => a + r.costUsd, 0) / rows.length;
const multi = rows.filter(r => r.langs !== 'English');
const eng = rows.filter(r => r.langs === 'English');
const avgOf = list => list.reduce((a, r) => a + r.costUsd, 0) / Math.max(1, list.length);

const byPurpose = run.scenarios.map(sc => {
  const p = sc.call.aiUsage.byPurpose || {};
  const cell = k => (p[k] ? `${p[k].requests}× · ${tok(p[k].inputTokens + p[k].outputTokens)} tok · ${usd(p[k].costUsd)}` : '—');
  return `| ${sc.id} | ${cell('understanding')} | ${cell('translation')} | ${cell('directions')} | ${cell('post-call analysis')} |`;
});

const recorded = new Date(run.recordedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const md = `# Vexa demo — what each call cost

Measured from Claude usage on every request (model: **claude-opus-5-5**, $4 / 1M input tokens, $20 / 1M output tokens; thinking is billed as output). Recorded ${recorded} IST. INR at ₹${INR} per $.

| # | Call | Languages | Caller turns | Claude requests | Input tokens | Output tokens | Total tokens | Cost (USD) | Cost (INR) |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
${all.map(r => `| ${r.id} | ${r.title} | ${r.langs} | ${r.turns} | ${r.requests} | ${tok(r.inputTokens)} | ${tok(r.outputTokens)} | ${tok(r.inputTokens + r.outputTokens)} | ${usd(r.costUsd)} | ${inr(r.costUsd)} |`).join('\n')}
| | **Total** | | | **${sum('requests')}** | **${tok(sum('inputTokens'))}** | **${tok(sum('outputTokens'))}** | **${tok(sum('inputTokens') + sum('outputTokens'))}** | **${usd(sum('costUsd'))}** | **${inr(sum('costUsd'))}** |

## Where the tokens go (per call)

| # | Understanding (per turn) | Translation (replies) | Directions (generated) | Post-call analysis |
|---|---|---|---|---|
${byPurpose.join('\n')}

## Notes

- **Average per call: ${usd(avg)} (${inr(avg)})** across ${rows.length} calls. English-only calls average ${usd(avgOf(eng))}; calls in other languages average ${usd(avgOf(multi))}, because Vexa also translates its replies and writes the summary in the caller's language.
- One-question calls (scenario 8) still pay for post-call analysis, which is the single largest request per call.
- **Not included:** telephony (phone-line minutes) and live voice (speech-in/speech-out). This recording used local macOS voices, which are free.
- **Cheapest levers:** run per-turn understanding and translation on Claude Haiku 4.5 (\`ANTHROPIC_FAST_MODEL\`) and keep Opus for post-call analysis; cache the stable prompt prefix.
- Test runs and the screen-capture run used extra tokens on top of these calls; they are not part of the figures above.
`;
fs.mkdirSync(new URL('./output/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./output/COSTS.md', import.meta.url), md);
console.log(`COSTS.md: ${all.length} rows, total ${usd(sum('costUsd'))}`);
