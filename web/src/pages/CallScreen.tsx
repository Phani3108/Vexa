import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronLeft, Clock, Mail, Mic, MicOff, PhoneForwarded, PhoneOff, RotateCcw, Send, Sparkles, Volume2, VolumeX, Wand2 } from 'lucide-react'
import { api } from '../lib/api'
import { useLive } from '../lib/live'
import type { CallDetail, FlowSlot, Risk, TurnResult, Workflow, WorkflowRun } from '../lib/types'
import { formatPhone } from '../lib/format'
import { canListen, canSpeak, listen, speak, stopSpeaking, LANG_BCP47, LANG_NAMES, LANG_SHORT } from '../lib/speech'
import Orb from '../components/Orb'
import { RiskBadge, toast } from '../components/ui'

interface Line { speaker: 'ai' | 'caller' | 'system' | 'owner'; text: string; lang?: string; en?: string | null }
type Slots = Record<string, { label: string; value: string }>

const COPILOT = [
  { label: 'Call back in 10 min', text: 'tell them I will call them back in 10 minutes', icon: Clock },
  { label: 'Ask for email', action: 'ask_email', icon: Mail },
  { label: 'Put them through', action: 'transfer', icon: PhoneForwarded },
  { label: 'End politely', action: 'end', icon: PhoneOff },
] as const

function useTimer(running: boolean) {
  const [s, setS] = useState(0)
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setS(x => x + 1), 1000)
    return () => clearInterval(t)
  }, [running])
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function Understanding({ flow, slots, asked, progress }: { flow?: Workflow | null; slots: Slots; asked?: string | null; progress?: number }) {
  const defs: FlowSlot[] = flow?.slots || []
  const extra = Object.keys(slots).filter(k => !defs.some(d => d.key === k))
  if (!defs.length && !extra.length) return null
  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 10 }}>
      <div className="understanding" aria-label="What Vexa understood">
        {defs.map(d => {
          const v = slots[d.key]
          return (
            <span key={d.key} className={`slot-chip${v ? ' filled' : ''}${asked === d.key ? ' asking' : ''}`}>
              {d.label}{v ? <b>{v.value}</b> : asked === d.key ? '…' : ''}
            </span>
          )
        })}
        {extra.map(k => <span key={k} className="slot-chip filled">{slots[k].label}<b>{slots[k].value}</b></span>)}
      </div>
      {progress != null && <div className="progress"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
    </div>
  )
}

export default function CallScreen({ mode }: { mode: 'test' | 'live' }) {
  const navigate = useNavigate()
  const { id } = useParams()
  const [params] = useSearchParams()
  const { calls } = useLive()
  const liveCall = mode === 'live' ? calls.find(c => c.callId === id) : null

  const [flows, setFlows] = useState<Workflow[]>([])
  const [session, setSession] = useState<string | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [state, setState] = useState<{ workflow: TurnResult['workflow']; slots: Slots; asked: string | null; progress: number }>({ workflow: null, slots: {}, asked: null, progress: 0 })
  const [risk, setRisk] = useState<Risk | null>(null)
  const [aiMode, setAiMode] = useState<'ai' | 'offline'>('offline')
  const [ended, setEnded] = useState(false)
  const [result, setResult] = useState<TurnResult['call'] | null>(null)
  const [busy, setBusy] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [voiceOn, setVoiceOn] = useState(() => canSpeak() && localStorage.getItem('vexa.voice') !== 'off')
  const [listening, setListening] = useState(false)
  const [input, setInput] = useState('')
  const [whisper, setWhisper] = useState('')
  const [copilot, setCopilot] = useState(mode === 'live')
  const [latency, setLatency] = useState<number | null>(null)
  const [currentLang, setCurrentLang] = useState('en')
  const [callerLang, setCallerLang] = useState<string>(() => { try { return localStorage.getItem('vexa.callerLang') || 'auto' } catch { return 'auto' } })
  const logRef = useRef<HTMLDivElement>(null)
  const stopListen = useRef<(() => void) | null>(null)
  const started = useRef(false)
  const timer = useTimer(mode === 'test' ? !!session && !ended : liveCall?.status === 'live')

  useEffect(() => { api<{ workflows: Workflow[] }>('/api/workflows').then(r => setFlows(r.workflows)).catch(() => {}) }, [])
  useEffect(() => { try { localStorage.setItem('vexa.voice', voiceOn ? 'on' : 'off') } catch { /* ignore */ } }, [voiceOn])
  useEffect(() => () => { stopSpeaking(); stopListen.current?.() }, [])

  function say(text: string, lang = 'en') {
    if (!voiceOn || !text) return
    setSpeaking(true)
    speak(text, () => setSpeaking(false), lang)
  }

  // The saved call (summary, lead, actions) is produced in the background after hang-up
  async function pollResult(callId: string) {
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, i === 0 ? 800 : 1500))
      try {
        const { call } = await api<{ call: { callId: string; analysis: CallDetail['analysis']; workflowRun?: WorkflowRun } }>(`/api/calls/${encodeURIComponent(callId)}`)
        if (call?.analysis?.summary) { setResult({ callId: call.callId, analysis: call.analysis, workflowRun: call.workflowRun }); return }
      } catch { /* not saved yet */ }
    }
  }

  function apply(r: TurnResult) {
    setState({ workflow: r.workflow, slots: r.slots || {}, asked: r.asked, progress: r.progress })
    setAiMode(r.mode)
    if (r.latencyMs != null) setLatency(r.latencyMs)
    if (r.ended) {
      setEnded(true)
      setLines(l => [...l, { speaker: 'system', text: r.transferred ? 'Transferred to you' : 'Call ended' }])
      if (r.call) setResult(r.call)
      else if (r.callId) pollResult(r.callId)
    }
  }

  async function start() {
    stopSpeaking()
    setBusy(true)
    setLines([]); setEnded(false); setResult(null); setState({ workflow: null, slots: {}, asked: null, progress: 0 })
    try {
      const r = await api<{ sessionId: string; greeting: string; greetingEn?: string; language?: string; mode: 'ai' | 'offline'; risk: Risk; workflow: TurnResult['workflow']; ended?: boolean; transferred?: boolean; call?: TurnResult['call'] }>('/api/simulator/start', { method: 'POST', body: { flowId: params.get('flow') || undefined } })
      setSession(r.sessionId)
      setRisk(r.risk)
      setAiMode(r.mode)
      setLines([{ speaker: 'system', text: 'Connected' }, { speaker: 'ai', text: r.greeting, lang: r.language, en: r.greetingEn }])
      setCurrentLang(r.language || 'en')
      if (r.workflow) setState(s => ({ ...s, workflow: r.workflow }))
      say(r.greeting, r.language)
      if (r.ended) apply({ reply: r.greeting, ended: true, transferred: !!r.transferred, asked: null, workflow: r.workflow, slots: {}, progress: 1, mode: r.mode, call: r.call })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not start')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (mode === 'test' && !started.current) { started.current = true; start() }
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  async function send(text: string, e?: FormEvent) {
    e?.preventDefault()
    const t = text.trim()
    if (!t || !session || ended || busy) return
    stopSpeaking()
    setInput('')
    setLines(l => [...l, { speaker: 'caller', text: t }])
    setBusy(true)
    try {
      const r = await api<TurnResult>(`/api/simulator/${session}/message`, { method: 'POST', body: { text: t } })
      setLines(l => {
        const copy = l.slice()
        const ci = copy.map(x => x.speaker).lastIndexOf('caller')
        if (ci >= 0 && r.heard) copy[ci] = { ...copy[ci], lang: r.heard.language, en: r.heard.translation }
        return [...copy, { speaker: 'ai', text: r.reply, lang: r.language, en: r.replyEn }]
      })
      setCurrentLang(r.language || 'en')
      say(r.reply, r.language)
      apply(r)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function steer(payload: { text?: string; action?: string }) {
    try {
      if (mode === 'live') {
        await api('/voice/whisper', { method: 'POST', body: { callId: id, ...payload } })
        toast('Sent to Vexa')
        return
      }
      if (!session || ended) return
      setLines(l => [...l, { speaker: 'owner', text: `You → Vexa: ${payload.text || payload.action?.replace('_', ' ')}` }])
      const r = await api<TurnResult>(`/api/simulator/${session}/whisper`, { method: 'POST', body: payload })
      if (r.reply) { setLines(l => [...l, { speaker: 'ai', text: r.reply, lang: r.language, en: r.replyEn }]); say(r.reply, r.language) }
      apply(r)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed')
    }
  }

  async function hangUp() {
    if (mode === 'live') {
      await api('/voice/end-call', { method: 'POST', body: { callId: id } }).catch(e => toast(e.message))
      return
    }
    if (!session || ended) return
    stopSpeaking()
    const r = await api<{ call: TurnResult['call'] }>(`/api/simulator/${session}/end`, { method: 'POST' })
    setEnded(true)
    setLines(l => [...l, { speaker: 'system', text: 'You hung up' }])
    setResult(r.call || null)
  }

  async function takeOver() {
    await api('/voice/takeover', { method: 'POST', body: { callId: id } }).then(() => toast('Calling your phone…')).catch(e => toast(e.message))
  }

  function mic() {
    if (listening) { stopListen.current?.(); setListening(false); return }
    stopSpeaking()
    setListening(true)
    stopListen.current = listen((t, final) => { setInput(t); if (final) { setListening(false); send(t) } }, () => setListening(false), callerLang === 'auto' ? undefined : LANG_BCP47[callerLang])
  }

  // Live mode mirrors the socket state
  const view = mode === 'live' && liveCall
    ? {
        lines: [...liveCall.transcript.map((t): Line => ({ speaker: (t.speaker === 'user' ? 'caller' : t.speaker) as Line['speaker'], text: t.text, lang: t.lang, en: t.textEn })), ...(liveCall.partial ? [{ speaker: 'ai', text: liveCall.partial } as Line] : [])],
        workflow: liveCall.workflow || null,
        slots: liveCall.slots || {},
        asked: liveCall.asked || null,
        progress: liveCall.progress,
        risk: liveCall.risk || null,
        ended: liveCall.status === 'ended',
        title: liveCall.callerName !== 'Unknown' ? liveCall.callerName : formatPhone(liveCall.from),
      }
    : { lines, workflow: state.workflow, slots: state.slots, asked: state.asked, progress: state.progress, risk, ended, title: 'Test caller' }

  const spokenLang = mode === 'live' ? ([...(view.lines || [])].reverse().find(l => l.speaker === 'caller' && l.lang)?.lang || 'en') : currentLang
  const flow = useMemo(() => flows.find(f => f.id === view.workflow?.id) || null, [flows, view.workflow?.id])
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }) }, [view.lines.length, busy])

  if (mode === 'live' && !liveCall) {
    return (
      <div className="call-screen">
        <div className="topbar"><button className="back" onClick={() => navigate('/')} aria-label="Back"><ChevronLeft size={20} /></button></div>
        <div className="center" style={{ textAlign: 'center' }}>
          <div className="stack" style={{ justifyItems: 'center' }}>
            <Orb size={80} />
            <h2>This call has ended</h2>
            <Link to="/activity" className="btn primary">See it in Activity</Link>
          </div>
        </div>
      </div>
    )
  }

  const orbState = busy ? 'thinking' : speaking || (mode === 'live' && liveCall?.partial) ? 'speaking' : 'idle'

  return (
    <div className="call-screen">
      <div className="topbar" style={{ marginBottom: 6 }}>
        <button className="back" onClick={() => navigate(-1)} aria-label="Back"><ChevronDown size={20} /></button>
        <div className="title">
          <span className={`badge ${view.ended ? '' : 'live'}`}><span className={`dot${view.ended ? '' : ' pulse'}`} />{view.ended ? 'Ended' : mode === 'test' ? 'Test call' : 'Live'} · <span className="mono">{timer}</span></span>
        </div>
        <RiskBadge score={view.risk?.score} />
      </div>

      <div className="call-hero">
        <Orb size={view.lines.length > 2 ? 60 : 96} state={orbState as 'idle'} />
        <div className="name">{view.title}</div>
        <div className="row" style={{ gap: 6 }}>
          {view.workflow ? <span className="badge accent"><Sparkles size={11} /> {view.workflow.name}</span> : <span className="badge">Listening for intent…</span>}
          {spokenLang !== 'en' && <span className="badge live" title="Vexa follows the caller's language">🗣 {LANG_SHORT[spokenLang] || spokenLang}</span>}
          {mode === 'test' && <span className={`badge ${aiMode === 'ai' ? 'ok' : 'warn'}`} title={aiMode === 'ai' ? 'Understanding by AI model' : 'Offline understanding (add OPENAI_API_KEY for AI)'}>{aiMode === 'ai' ? 'AI understanding' : 'Offline engine'}</span>}
          {latency != null && <span className="badge mono">{latency}ms</span>}
        </div>
        <Understanding flow={flow} slots={view.slots} asked={view.asked} progress={view.progress} />
      </div>

      <div className="call-log" ref={logRef} aria-live="polite">
        {mode === 'test' && params.get('welcome') && lines.length <= 2 && (
          <div className="alert accent small" style={{ marginBottom: 10 }}>
            <Sparkles size={16} style={{ flex: 'none' }} />
            <span>Your receptionist is live. You're the caller — try saying everything at once, like “Hi, I'm Dana, I need a quote for a water heater tomorrow morning”, and watch it skip questions.</span>
          </div>
        )}
        <div className="bubbles">
          {view.lines.map((l, i) => (
            <div key={i} className={`bubble ${l.speaker}`}>
              {l.text}
              {l.lang && l.lang !== 'en' && l.en && l.en !== l.text && <div className="bubble-en">{l.en}</div>}
            </div>
          ))}
          {busy && <div className="bubble ai"><span className="typing-dots"><i /><i /><i /></span></div>}
        </div>

        {mode === 'test' && ended && !result && (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="row"><span className="typing-dots"><i /><i /><i /></span><span className="small dim">Writing the summary and applying outcomes…</span></div>
          </div>
        )}
        {mode === 'test' && ended && result && (
          <div className="card glow" style={{ marginTop: 14 }}>
            <div className="eyebrow">What you'll see after the call</div>
            <p style={{ marginTop: 6, fontWeight: 500 }}>{result.analysis?.summary}</p>
            <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
              {result.analysis?.lead?.isLead && <span className="badge live">Lead captured</span>}
              {result.analysis?.isSpam && <span className="badge">Spam</span>}
              {(result.workflowRun?.actions || []).map((a, i) => <span key={i} className="badge">{a.type.replace('_', ' ')} · {a.result?.status}</span>)}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <Link to={`/call/${result.callId}`} className="btn sm primary">Open call</Link>
              <button className="btn sm" onClick={start}><RotateCcw size={14} /> New test</button>
            </div>
          </div>
        )}
      </div>

      {!view.ended && (
        <div className="dock">
          {copilot && (
            <>
              <div className="chips">
                {COPILOT.map(c => (
                  <button key={c.label} className="chip" onClick={() => steer('action' in c ? { action: c.action } : { text: c.text })}><c.icon size={14} /> {c.label}</button>
                ))}
              </div>
              <form className="composer" onSubmit={e => { e.preventDefault(); if (whisper.trim()) { steer({ text: whisper }); setWhisper('') } }}>
                <input className="input" placeholder="Tell Vexa what to say…" value={whisper} onChange={e => setWhisper(e.target.value)} aria-label="Instruction to Vexa" />
                <button className="btn icon round" disabled={!whisper.trim()} aria-label="Send instruction"><Wand2 size={17} /></button>
              </form>
            </>
          )}

          {mode === 'test' && (
            <div className="row" style={{ gap: 8 }}>
              <span className="xs muted" style={{ flex: 'none' }}>Caller speaks</span>
              <select className="select" style={{ height: 34, fontSize: 13, borderRadius: 10 }} value={callerLang} aria-label="Caller language (for the microphone)"
                onChange={e => { setCallerLang(e.target.value); try { localStorage.setItem('vexa.callerLang', e.target.value) } catch { /* private mode */ } }}>
                <option value="auto">Auto (type in any language)</option>
                {Object.entries(LANG_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          )}
          {mode === 'test' ? (
            <form className="composer" onSubmit={e => send(input, e)}>
              <button type="button" className="btn icon round" onClick={() => { setVoiceOn(v => !v); stopSpeaking() }} aria-label={voiceOn ? 'Mute Vexa' : 'Hear Vexa'}>{voiceOn ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
              <input className="input" placeholder={listening ? 'Listening…' : 'Speak as the caller…'} value={input} onChange={e => setInput(e.target.value)} aria-label="Caller says" />
              {canListen() && <button type="button" className={`btn icon round ${listening ? 'primary' : ''}`} onClick={mic} aria-label={listening ? 'Stop' : 'Talk'}>{listening ? <MicOff size={18} /> : <Mic size={18} />}</button>}
              <button className="btn icon round primary" disabled={!input.trim() || busy} aria-label="Send"><Send size={17} /></button>
            </form>
          ) : null}

          <div className="row" style={{ justifyContent: 'center', gap: 14 }}>
            <button className={`btn sm ${copilot ? 'primary' : ''}`} onClick={() => setCopilot(c => !c)}><Wand2 size={15} /> Copilot</button>
            {mode === 'live' && <button className="btn sm" onClick={takeOver}><PhoneForwarded size={15} /> Take over</button>}
            <button className="btn icon round danger" onClick={hangUp} aria-label="Hang up"><PhoneOff size={18} /></button>
          </div>
        </div>
      )}
      {mode === 'test' && ended && (
        <button className="btn block" onClick={start}><RotateCcw size={16} /> New test call</button>
      )}
    </div>
  )
}
