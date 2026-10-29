/* Deterministic renderer: window.render(t) draws the frame at time t (seconds). */
(function () {
  const { timeline, run, screens } = window.DATA;
  const stage = document.getElementById('stage');
  const SCREEN_DIR = '../build/screens/';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtT = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const money = n => `$${(n || 0).toFixed(4)}`;
  const LABEL = { ai: 'Vexa', caller: 'Caller', owner: 'You', system: 'System' };
  const LANG = { en: 'English', hi: 'Hindi', te: 'Telugu', ta: 'Tamil', ml: 'Malayalam', mr: 'Marathi', gu: 'Gujarati', es: 'Spanish' };
  const typed = (l, t) => (l.env && t < l.end ? Math.max(0, Math.min(1, (t - l.start) / (l.end - l.start))) : 1);
  const cut = (text, f) => (f >= 1 ? text : text.slice(0, Math.max(1, Math.ceil(text.length * f))));

  function segAt(t) {
    return timeline.segments.find(s => t >= s.start && t < s.end) || timeline.segments[timeline.segments.length - 1];
  }

  function orb(size, t, speaking) {
    const spin = (t * (speaking ? 160 : 40)) % 360;
    const pulse = speaking ? 1 + 0.08 * Math.sin(t * 14) : 1 + 0.04 * Math.sin(t * 2.2);
    return `<div class="orb" style="width:${size}px;height:${size}px">
      <div class="glow" style="transform:scale(${pulse});${speaking ? 'background:radial-gradient(circle, rgba(62,230,213,.55), transparent 65%)' : ''}"></div>
      <div class="ring" style="transform:rotate(${spin}deg)"></div><div class="core"></div></div>`;
  }

  function top(seg, t) {
    const kicker = seg.kicker || (seg.scenario ? `Scenario ${seg.scenario.id}` : '');
    return `<div class="top">
      <div class="logo"><div class="logo-mark"><svg width="18" height="18" viewBox="0 0 32 32"><path d="M8 9l8 15 8-15" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>Vexa</div>
      ${kicker ? `<span class="chip accent">${esc(kicker)}</span>` : ''}
      <div class="spacer"></div>
      <span class="chip live"><span class="dot"></span>Real Claude run · claude-opus-5-5</span>
      <span class="chip">Voices synthesized · thinking pauses shortened</span>
      <span class="chip">${fmtT(t)} / ${fmtT(timeline.duration)}</span>
    </div>`;
  }

  function subs(t, side) {
    const c = timeline.subtitles.find(s => t >= s.start && t < s.end + 0.15);
    if (!c) return '';
    const cls = c.speaker.startsWith('Vexa') ? '' : c.speaker === 'Narrator' || c.speaker === 'Recording' ? 'narr' : c.speaker.startsWith('You') ? 'owner' : 'caller';
    return `<div class="subs${side ? ' side-subs' : ''}"><span class="sp ${cls}">${esc(c.speaker)}:</span>${esc(c.text)}</div>`;
  }

  function wave(canvas, line, t) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width = 1200, H = canvas.height = 172;
    ctx.clearRect(0, 0, W, H);
    const bars = 96;
    const color = !line ? '#353b5c' : line.speaker === 'ai' ? '#8b7bff' : line.speaker === 'owner' ? '#3ee6d5' : line.speaker === 'narrator' ? '#9fb7ff' : '#ffc15e';
    const idx = line ? Math.floor((t - line.start) * 30) : 0;
    for (let i = 0; i < bars; i++) {
      const k = idx - (bars - 1 - i);
      let v = line && k >= 0 && k < line.env.length ? line.env[k] : 0;
      v = Math.max(0.03, Math.min(1, v * 1.25));
      const h = v * (H - 10);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.35 + 0.65 * (i / bars);
      const x = i * (W / bars);
      ctx.beginPath();
      ctx.roundRect(x + 2, (H - h) / 2, W / bars - 5, h, 4);
      ctx.fill();
    }
  }

  // ── Segments ──────────────────────────────────────────────────────────────
  function renderTitle(seg, t) {
    return `<div class="center"><div>
      <div style="display:grid;place-items:center;margin-bottom:26px">${orb(130, t, (seg.narration || []).some(n => t >= n.start && t < n.end))}</div>
      <div class="kicker">${esc(seg.kicker)}</div>
      <div class="title" style="margin-top:12px">${esc(seg.title)}</div>
      <div class="subtitle">${esc(seg.subtitle)}</div>
    </div></div>`;
  }

  function tapHtml(x, y, t, at) {
    const p = (t - at) / 0.8;
    if (p < 0 || p > 1) return '';
    const s = 0.6 + p * 0.9;
    return `<div class="tap" style="left:${x * 100}%;top:${y * 100}%;transform:scale(${s});opacity:${1 - p}"></div>`;
  }

  function renderScreen(seg, t) {
    const taps = (seg.taps || []).map(tp => {
      const pos = tp.target === 'mode-business' ? screens.modeBusiness : tp;
      return tapHtml(pos.x, pos.y, t, tp.t);
    }).join('');
    const speaking = (seg.narration || []).find(n => t >= n.start && t < n.end);
    return `<div class="phone"><img class="screen" src="${SCREEN_DIR}${seg.image}" />${taps}</div>
      <div class="side" style="justify-content:center">
        <div class="kicker">${esc(seg.kicker)}</div>
        <div class="caption">${esc(seg.caption)}</div>
        <div class="card" style="flex:none;margin-top:10px"><h4>Voice</h4><canvas id="wave"></canvas></div>
      </div>${'' && speaking}`;
  }

  function lineAt(lines, t) {
    return lines.find(l => l.env && t >= l.start && t < l.end) || null;
  }

  function renderCall(seg, t) {
    const sc = seg.scenario;
    const lines = seg.lines;
    const started = lines.filter(l => l.start <= t);
    const convo = started.filter(l => l.speaker !== 'narrator');
    const lastAi = [...started].reverse().find(l => l.speaker === 'ai' && l.understanding);
    const und = lastAi?.understanding || {};
    const thinking = lines.find(l => l.speaker === 'ai' && l.thinkStart != null && t >= l.thinkStart && t < l.start && l.latencyMs);
    const active = lineAt(lines, t);
    const outcomeOn = t >= seg.outcome.start;

    // Phone: an app screen (handoff) or the call UI
    const imgLine = [...started].reverse().find(l => l.speaker === 'system' || l.speaker === 'caller' || l.speaker === 'ai' || l.speaker === 'owner' || l.phoneImage);
    let phone;
    const imageLines = started.filter(l => l.phoneImage);
    const lastImage = imageLines[imageLines.length - 1];
    const afterImage = lastImage ? lines.find(l => l.start > lastImage.start && !l.phoneImage) : null;
    const showImage = lastImage && (!afterImage || t < afterImage.start);
    if (showImage) {
      const group = lines.filter(l => l.phoneImage === lastImage.phoneImage);
      const groupEnd = group.reduce((m, l) => Math.max(m, l.end), 0);
      const first = group.find(l => l.tap);
      const pos = first?.tap === 'accept' ? { x: 0.651, y: 0.877 } : { x: 0.382, y: 0.877 };
      phone = `<div class="phone"><img class="screen" src="${SCREEN_DIR}${lastImage.phoneImage}" />${tapHtml(pos.x, pos.y, t, groupEnd - 0.7)}</div>`;
    } else {
      const multi = convo.some(l => l.lang && l.lang !== 'en');
      const bubbleLines = convo.slice(multi ? -5 : -7).map(l => {
        const f = typed(l, t);
        const cls = l.speaker === 'system' ? 'system' : l.speaker;
        const foreign = l.lang && l.lang !== 'en';
        return `<div class="bubble ${cls}">${foreign ? `<span class="lang">${esc(LANG[l.lang] || l.lang)}</span>` : ''}${esc(cut(l.text, f))}${foreign && l.en && f >= 1 ? `<div class="en">${esc(l.en)}</div>` : ''}</div>`;
      }).join('');
      const filled = Object.entries(und.slots || {});
      const slotHtml = filled.map(([k, v]) => `<span class="slot">${esc(v.label)} <b>${esc(v.value)}</b></span>`).join('') +
        (und.asked && !und.asked.startsWith('confirm:') && !und.slots?.[und.asked] ? `<span class="slot pending">${esc(und.asked)}…</span>` : '');
      const name = (und.slots?.name?.value) || (sc.id === '3' ? 'Amma' : sc.callerName);
      const speaking = active && active.speaker === 'ai';
      phone = `<div class="phone"><div class="call">
        <div class="call-top"><span class="chip live" style="height:28px;font-size:12px"><span class="dot"></span>Live · ${fmtT(Math.max(0, t - seg.start))}</span>
          ${sc.risk ? `<span class="chip ${sc.risk.score >= 60 ? 'danger' : sc.risk.score >= 30 ? 'warn' : 'ok'}" style="height:28px;font-size:12px">risk ${sc.risk.score}</span>` : ''}</div>
        <div class="hero">${orb(lines.indexOf(lastAi) > 1 ? 62 : 92, t, speaking || !!thinking)}
          <div class="name">${esc(name)}</div>
          ${und.workflow ? `<span class="chip accent" style="height:26px;font-size:12px">✦ ${esc(und.workflow.name)}</span>` : '<span class="chip" style="height:26px;font-size:12px">Listening for intent…</span>'}
          <div class="slots">${slotHtml}</div>
          ${und.progress != null ? `<div class="progress"><i style="width:${Math.round((und.progress || 0) * 100)}%"></i></div>` : ''}
        </div>
        <div class="bubbles">${bubbleLines}${thinking ? '<div class="bubble ai"><span class="typing"><i></i><i></i><i></i></span></div>' : ''}</div>
        <div class="dock"><div class="round">🎙</div><div class="round">✦</div><div class="round end">✆</div></div>
      </div></div>`;
    }
    void imgLine;

    // Right: transcript with intelligence, understanding, voice, cost / outcome
    const multiT = convo.some(l => l.lang && l.lang !== 'en');
    const transcript = convo.slice(multiT ? -5 : -7).map(l => {
      const cls = l.speaker;
      const who = l.speaker === 'caller' ? (sc.id === '3' ? 'Amma' : sc.callerName.replace('Delivery executive', 'Courier')) : LABEL[l.speaker] || l.speaker;
      const f = typed(l, t);
      const foreign = l.lang && l.lang !== 'en';
      const style = l.style ? [l.style.mixed ? 'mixed with English' : '', l.style.script === 'latin' && l.lang !== 'en' && l.lang !== 'es' ? 'English letters' : ''].filter(Boolean).join(' · ') : '';
      const tag = foreign ? `<span class="lang ${cls === 'ai' ? 'ai' : ''}">${esc(LANG[l.lang] || l.lang)}${style ? ` · ${esc(style)}` : ''}</span>` : '';
      const silent = l.silent ? '<span class="chip" style="height:22px;font-size:11px;margin-left:6px">no local voice · text only</span>' : '';
      const meta = l.speaker === 'ai' && l.latencyMs ? `<div class="meta"><span>Claude understood in ${(l.latencyMs / 1000).toFixed(1)}s</span>${l.turnTokens ? `<span>${l.turnTokens.toLocaleString()} tok · ${money(l.turnCost)}</span>` : ''}</div>` : '';
      return `<div class="tline"><div class="who ${cls}">${esc(who)}</div><div>${tag}${esc(cut(l.text, f))}${silent}${foreign && l.en && f >= 1 ? `<div class="en">${esc(l.en)}</div>` : ''}${meta}</div></div>`;
    }).join('') + (thinking ? `<div class="tline"><div class="who ai">Vexa</div><div class="muted">Claude is reading the caller… <span class="chip accent" style="height:24px;font-size:12px">real latency ${(thinking.latencyMs / 1000).toFixed(1)}s</span></div></div>` : '');

    const prevSlots = (() => {
      const ais = started.filter(l => l.speaker === 'ai' && l.understanding);
      return ais.length > 1 ? ais[ais.length - 2].understanding.slots || {} : {};
    })();
    const heard = [];
    for (const l of started) if (l.speaker === 'caller' && l.lang && heard[heard.length - 1] !== l.lang) heard.push(l.lang);
    const langRow = heard.some(x => x !== 'en') ? `<div class="row"><span class="k">Caller language</span><span class="v new">${esc(heard.map(x => LANG[x] || x).join(' → '))}</span></div>` : '';
    const facts = (langRow + Object.entries(und.slots || {}).map(([k, v]) => `<div class="row"><span class="k">${esc(v.label)}</span><span class="v ${prevSlots[k] ? '' : 'new'}">${esc(v.value)}</span></div>`).join(''))
      || '<div class="muted small">Waiting for the caller…</div>';
    const spent = [...started].reverse().find(l => l.spent != null);
    const costCard = `<div class="card" style="flex:none"><h4>AI cost so far</h4><div class="bigcost">${money(outcomeOn ? seg.outcome.totalCost : spent?.spent || 0)}</div><div class="muted small">${(outcomeOn ? seg.outcome.totalTokens : spent?.tokens || 0).toLocaleString()} tokens${outcomeOn ? ' · incl. post-call analysis' : ''}</div></div>`;

    const right = outcomeOn
      ? `<div class="card outcome" style="flex:none"><h4>✦ After the call</h4>
          <div style="font-size:20px;line-height:1.4;font-weight:500">${esc(seg.outcome.summary)}</div>
          ${sc.summaryLocal?.text ? `<div style="font-size:17px;line-height:1.45;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);color:var(--text-2)"><span class="chip" style="height:22px;font-size:11px;margin-right:6px">${esc(LANG[sc.summaryLocal.lang] || sc.summaryLocal.lang)}</span>${esc(sc.summaryLocal.text)}</div>` : ''}
          <div class="actions">
            <span class="chip accent">${esc(seg.outcome.workflow || '')} · ${esc(seg.outcome.status || '')}</span>
            ${(seg.outcome.actions || []).map(a => `<span class="chip ${a.status === 'failed' ? 'danger' : 'ok'}">${esc(a.type.replace(/_/g, ' '))} · ${esc(a.status)}</span>`).join('')}
            ${seg.outcome.lead?.isLead ? '<span class="chip live">Lead / message captured</span>' : ''}
            ${seg.outcome.questionsAsked != null ? `<span class="chip">${seg.outcome.questionsAsked} questions asked</span>` : ''}
          </div></div>`
      : `<div class="card" style="flex:none"><h4>✦ What Vexa understands ${und.workflow ? `<span class="chip accent" style="height:26px;font-size:12px;letter-spacing:0;text-transform:none">${esc(und.workflow.name)}</span>` : ''}</h4><div class="facts">${facts}</div></div>`;

    return `${phone}
      <div class="side">
        <div><div class="kicker">Scenario ${esc(sc.id)}</div><div class="title">${esc(sc.title)}</div><div class="subtitle">${esc(sc.subtitle)}</div></div>
        <div class="grid">
          <div class="card"><h4>Transcript ${active ? `<span class="chip ${active.speaker === 'ai' ? 'accent' : 'warn'}" style="height:24px;font-size:12px;letter-spacing:0;text-transform:none"><span class="dot"></span>${active.speaker === 'ai' ? 'Vexa speaking' : active.speaker === 'narrator' ? 'Narrator' : active.speaker === 'owner' ? 'You speaking' : 'Caller speaking'}</span>` : ''}</h4>${transcript}</div>
          <div class="col">${right}
            <div class="card" style="flex:none"><h4>Voice</h4><canvas id="wave"></canvas></div>
            ${costCard}
          </div>
        </div>
      </div>`;
  }

  function renderCosts(seg) {
    const rows = seg.costs.map(c => `<tr><td>${esc(c.id)}</td><td>${esc(c.title)}</td><td class="num">${c.requests}</td><td class="num">${c.inputTokens.toLocaleString()}</td><td class="num">${c.outputTokens.toLocaleString()}</td><td class="num">${(c.inputTokens + c.outputTokens).toLocaleString()}</td><td class="num">${money(c.costUsd)}</td><td class="num">₹${(c.costUsd * 84).toFixed(2)}</td></tr>`).join('');
    return `<div class="side" style="left:120px;right:120px;top:110px;bottom:150px;gap:14px">
      <div><div class="kicker">The bill</div><div class="title">What each call cost</div><div class="subtitle">Claude Opus 5.5 · $4 per million input tokens · $20 per million output tokens · ₹ at 84 per $</div></div>
      <div class="card" style="flex:none;padding:8px 20px"><table style="font-size:19px">
        <tr><th>#</th><th>Call</th><th style="text-align:right">Requests</th><th style="text-align:right">Input tok</th><th style="text-align:right">Output tok</th><th style="text-align:right">Total tok</th><th style="text-align:right">Cost</th><th style="text-align:right">₹</th></tr>
        ${rows.replace(/<td/g, '<td style="padding:8px 14px"')}
        <tr class="total"><td></td><td>Total</td><td></td><td></td><td></td><td class="num">${seg.totalTokens.toLocaleString()}</td><td class="num">${money(seg.total)}</td><td class="num">₹${(seg.total * 84).toFixed(2)}</td></tr>
      </table></div>
      <div class="muted small">Measured from Claude's usage on each request (understanding every turn, translation of replies, generated directions, post-call analysis). Phone-line and voice costs are not included — this recording used local synthesized voices.</div>
    </div>`;
  }

  function renderTable(seg, t) {
    const speaking = (seg.narration || []).some(n => t >= n.start && t < n.end);
    const head = seg.columns.map((c, i) => `<th style="${i > 0 && seg.columns.length === 4 ? 'text-align:right' : ''}">${esc(c)}</th>`).join('');
    const body = seg.rows.map((r, ri) => `<tr class="${(seg.highlight || []).includes(ri) ? 'hl' : ''}">${r.map((c, i) => `<td class="${i > 0 && seg.columns.length === 4 ? 'num' : ''}" style="${i > 0 && seg.columns.length === 4 ? 'text-align:right' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('');
    return `<div class="side" style="left:120px;right:120px;top:110px;bottom:160px;gap:16px">
      <div style="display:flex;align-items:center;gap:22px">${orb(70, t, speaking)}<div><div class="kicker">${esc(seg.kicker)}</div><div class="title">${esc(seg.title)}</div><div class="subtitle">${esc(seg.subtitle)}</div></div></div>
      <div class="card tbl" style="flex:none"><table><tr>${head}</tr>${body}</table></div>
      ${seg.note ? `<div class="muted small">${esc(seg.note)}</div>` : ''}
    </div>`;
  }

  window.render = function (t) {
    const seg = segAt(t);
    let body = '';
    if (seg.type === 'title') body = renderTitle(seg, t);
    else if (seg.type === 'screen') body = renderScreen(seg, t);
    else if (seg.type === 'call') body = renderCall(seg, t);
    else if (seg.type === 'costs') body = renderCosts(seg);
    else if (seg.type === 'table') body = renderTable(seg, t);
    stage.innerHTML = top(seg, t) + body + subs(t, seg.type === 'call' || seg.type === 'screen');
    const canvas = document.getElementById('wave');
    if (canvas) {
      const lines = seg.type === 'call'
        ? [...seg.lines, ...(seg.outcomeNarration || []).map(n => ({ ...n, speaker: 'narrator' }))]
        : (seg.narration || []).map(n => ({ ...n, speaker: 'narrator' }));
      wave(canvas, lineAt(lines, t), t);
    }
    // wait for images in this frame
    const imgs = [...stage.querySelectorAll('img')];
    return Promise.all(imgs.map(i => (i.complete ? null : new Promise(r => { i.onload = i.onerror = r; })))).then(() => true);
  };
})();
