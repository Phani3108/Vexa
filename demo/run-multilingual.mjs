/** Real Claude runs: language switching mid-call + every supported language. */
const B = 'http://localhost:3000';
let token;
async function api(p, { method = 'GET', body } = {}) {
  const res = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = await res.json().catch(() => ({})); if (!res.ok) throw new Error(`${p} ${res.status} ${d.error}`); return d;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { devCode } = await api('/api/auth/otp/request', { method: 'POST', body: { phoneNumber: '+15550001077' } });
token = (await api('/api/auth/otp/verify', { method: 'POST', body: { phoneNumber: '+15550001077', code: devCode } })).token;
await api('/api/users/mode', { method: 'POST', body: { accountType: 'business' } });

async function call(title, lines) {
  console.log(`\n▶ ${title}`);
  const s = await api('/api/simulator/start', { method: 'POST', body: {} });
  console.log(`  AI [${s.language}]: ${s.greeting}`);
  let callId;
  for (const line of lines) {
    const r = await api(`/api/simulator/${s.sessionId}/message`, { method: 'POST', body: { text: line } });
    console.log(`  Caller [${r.heard?.language}]: ${line}\n     ↳ en: ${r.heard?.translation}`);
    console.log(`  AI [${r.language}] (${r.latencyMs}ms): ${r.reply}\n     ↳ en: ${r.replyEn}`);
    if (r.ended) { callId = r.callId; break; }
  }
  return callId;
}

const switching = await call('Telugu → Hindi → English (booking)', [
  'నమస్తే, రేపు ఉదయం 11 గంటలకు AC సర్వీస్ బుక్ చేయాలి.',
  'मेरा नाम रवि कुमार है।',
  "Yes, that's correct."
]);
await call('Spanish (stock & price)', ['Hola, ¿tienen ventiladores de techo de 1200 mm? Necesito tres.', 'Sí, por favor, resérvenlos.', 'Me llamo Carlos.']);
await call('Tamil (directions)', ['வணக்கம், உங்கள் கடை எங்கே இருக்கிறது?']);
await call('Malayalam (hours)', ['ഞായറാഴ്ച കട തുറന്നിരിക്കുമോ?']);
await call('Marathi (booking)', ['नमस्कार, मला उद्या संध्याकाळी 5 वाजता प्लंबर पाहिजे आहे.']);
await call('Gujarati (stock)', ['નમસ્તે, તમારી પાસે LED બલ્બ છે? મારે દસ જોઈએ છે.']);

for (let i = 0; i < 30 && switching; i++) {
  await sleep(1500);
  const d = await api(`/api/calls/${switching}`).catch(() => null);
  if (d?.call?.analysis?.summary && d.call.aiUsage) {
    console.log('\n▶ Saved bilingual transcript (Telugu → Hindi → English call)');
    for (const l of d.call.transcript) console.log(`  [${l.speaker}/${l.lang}] ${l.text}${l.lang !== 'en' ? `\n        en: ${l.textEn}` : ''}`);
    console.log(`  languages: ${d.call.languages.join(', ')}`);
    console.log(`  summary (en): ${d.call.analysis.summary}`);
    console.log(`  summary (${d.call.analysis.summaryLocal?.lang}): ${d.call.analysis.summaryLocal?.text}`);
    console.log(`  cost: $${d.call.aiUsage.costUsd} · ${JSON.stringify(Object.fromEntries(Object.entries(d.call.aiUsage.byPurpose).map(([k, v]) => [k, `${v.requests}× $${v.costUsd.toFixed(4)}`])))}`);
    const gu = await api(`/api/calls/${switching}/translate`, { method: 'POST', body: { lang: 'gu' } });
    console.log(`\n▶ Owner reads it in Gujarati: ${gu.summary}\n  first line: ${gu.lines[1]}  ·  $${gu.aiUsage.costUsd}`);
    break;
  }
}
