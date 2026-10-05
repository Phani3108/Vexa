import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Ban, Check, CheckCircle2, ChevronDown, ChevronUp, Languages, Mic, MessageSquare, Phone, Send, Sparkles, Trash2, X } from 'lucide-react'
import { api } from '../lib/api'
import type { CallDetail, CallerProfile, FollowUpStatus, TranscriptLine } from '../lib/types'
import { LANG_NAMES, LANG_SHORT } from '../lib/speech'
import { formatDuration, formatPhone } from '../lib/format'
import { CallerAvatar, FollowUpBadge, PageLoader, RiskBadge, Toggle, TopBar, toast } from '../components/ui'

const LABELS: Record<string, string> = { need: 'Needs', timing: 'Timing', when: 'Preferred time', service: 'Service', problem: 'Problem', issue: 'Issue', callback: 'Callback number', callbackTime: 'Best time', reason: 'Reason' }

const ACTION_LABEL: Record<string, string> = {
  create_lead: 'Added to inbox',
  book_request: 'Booking request',
  send_sms: 'Text to caller',
  notify_owner: 'Notified you',
  tag_spam: 'Marked as spam',
}

export default function CallDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [call, setCall] = useState<CallDetail | null>(null)
  const [caller, setCaller] = useState<CallerProfile | null>(null)
  const [draft, setDraft] = useState<{ body: string; to: string; canSend: boolean } | null>(null)
  const [reply, setReply] = useState('')
  const [note, setNote] = useState('')
  const [showTranscript, setShowTranscript] = useState(false)
  const [view, setView] = useState<'both' | 'original' | 'english'>('both')
  const [readIn, setReadIn] = useState<{ lang: string; lines: string[]; summary: string | null } | null>(null)
  const [translating, setTranslating] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ call: CallDetail }>(`/api/calls/${encodeURIComponent(id)}`).then(({ call }) => {
      setCall(call)
      api<{ caller: CallerProfile }>(`/api/calls/caller/${encodeURIComponent(call.phoneNumber)}/profile`).then(r => setCaller(r.caller)).catch(() => {})
      if (!call.analysis?.isSpam) api<{ body: string; to: string; canSend: boolean }>(`/api/calls/${encodeURIComponent(id)}/reply-draft`).then(d => { setDraft(d); setReply(d.body) }).catch(() => {})
    }).catch(e => setError(e.message))
  }, [id])

  if (error) return <><TopBar title="Call" /><div className="alert danger">{error}</div></>
  if (!call) return <PageLoader />

  const a = call.analysis || {}
  const run = call.workflowRun
  const name = a.callerName || a.lead?.name || (caller?.callerName !== 'Unknown' ? caller?.callerName : null)

  async function setFollow(status: FollowUpStatus) {
    const r = await api<{ followUp: CallDetail['followUp'] }>(`/api/calls/${encodeURIComponent(id)}/follow-up`, { method: 'PATCH', body: { status } })
    setCall(c => c && { ...c, followUp: r.followUp })
    toast(status === 'done' ? 'Done ✓' : 'Updated')
  }

  async function sendText() {
    if (!draft) return
    if (!draft.canSend && !call?.isTest) {
      window.location.href = `sms:${draft.to}?&body=${encodeURIComponent(reply)}`
      return
    }
    const r = await api<{ status: string; detail?: string }>(`/api/calls/${encodeURIComponent(id)}/sms`, { method: 'POST', body: { body: reply } })
    toast(r.status === 'sent' ? 'Text sent' : r.status === 'simulated' ? 'Sent (test call — simulated)' : r.detail || 'Not sent')
    setCall(c => c && { ...c, followUp: { ...c.followUp, status: 'in_progress' } })
  }

  async function saveCaller(patch: Partial<CallerProfile>) {
    const r = await api<{ caller: CallerProfile }>(`/api/calls/caller/${encodeURIComponent(call!.phoneNumber)}`, { method: 'PATCH', body: patch })
    setCaller(r.caller)
  }

  async function addNote() {
    if (!note.trim()) return
    await saveCaller({ instructions: [...(caller?.instructions || []), { text: note.trim(), once: true }] })
    setNote('')
    toast('Vexa will pass that on next time they call')
  }

  async function block() {
    if (!confirm(`Block ${formatPhone(call!.phoneNumber)}? Future calls are rejected before Vexa answers.`)) return
    await api('/api/users/blocked-numbers', { method: 'POST', body: { phoneNumber: call!.phoneNumber } }).catch(e => toast(e.message))
    toast('Blocked')
  }

  async function remove() {
    if (!confirm('Delete this call and its transcript?')) return
    await api(`/api/calls/${encodeURIComponent(id)}`, { method: 'DELETE' })
    toast('Deleted')
    navigate(-1)
  }

  const slots = Object.entries(run?.slots || {}).filter(([, v]) => v && v !== '—')
  const langs = (call.languages || []).filter(l => l && l !== 'en')
  const multilingual = langs.length > 0 || call.transcript.some(t => t.lang && t.lang !== 'en')

  async function readInLanguage(lang: string) {
    if (!lang) { setReadIn(null); return }
    setTranslating(true)
    try {
      const r = await api<{ lang: string; lines: string[]; summary: string | null }>(`/api/calls/${encodeURIComponent(id)}/translate`, { method: 'POST', body: { lang } })
      setReadIn(r)
      setShowTranscript(true)
    } catch (e) { toast((e as Error).message) } finally { setTranslating(false) }
  }

  async function loadAudio(): Promise<HTMLAudioElement | null> {
    if (!audioUrl) {
      const r = await api<{ url: string }>(`/api/calls/${encodeURIComponent(id)}/recording-link`)
      setAudioUrl(r.url)
      await new Promise(res => setTimeout(res, 0))
    }
    return audioRef.current
  }

  async function seekTo(t: TranscriptLine) {
    if (!call?.recording || !t.timestamp) return
    const start = new Date(call.recording.startedAt || call.startedAt || call.createdAt).getTime()
    const at = Math.max(0, (new Date(t.timestamp).getTime() - start) / 1000 - 0.3)
    const el = await loadAudio().catch(() => null)
    if (!el) return
    el.currentTime = Math.min(at, call.recording.durationSec || at)
    el.play().catch(() => {})
  }

  async function deleteRecording() {
    if (!confirm('Delete the audio recording? The transcript stays.')) return
    await api(`/api/calls/${encodeURIComponent(id)}/recording`, { method: 'DELETE' })
    setAudioUrl(null)
    setCall(c => c && { ...c, recording: undefined })
    toast('Recording deleted')
  }

  return (
    <>
      <TopBar title={call.isTest ? 'Test call' : 'Call'} right={<RiskBadge score={run?.risk?.score} />} />

      <div style={{ display: 'grid', justifyItems: 'center', gap: 8, textAlign: 'center', marginBottom: 18 }}>
        <CallerAvatar call={{ callerName: name, isSpam: !!a.isSpam, urgency: a.urgency as 'normal', lead: a.lead || null }} size="lg" />
        <h1 style={{ fontSize: 24 }}>{name || formatPhone(call.phoneNumber)}</h1>
        <p className="small muted">{name ? `${formatPhone(call.phoneNumber)} · ` : ''}{new Date(call.createdAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })} · {formatDuration(call.duration)}</p>
        <div className="row wrap" style={{ justifyContent: 'center', gap: 6 }}>
          {run?.workflowName && <span className="badge accent">{run.workflowName}</span>}
          {run?.status === 'transferred' && <span className="badge live">Transferred to you</span>}
          {a.isSpam && <span className="badge">Spam</span>}
          <FollowUpBadge status={call.followUp?.status || 'none'} />
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'center', gap: 12, marginBottom: 18 }}>
        <a className="btn icon round" href={`tel:${a.lead?.callbackNumber || call.phoneNumber}`} aria-label="Call back"><Phone size={18} /></a>
        <a className="btn icon round" href={`sms:${a.lead?.callbackNumber || call.phoneNumber}`} aria-label="Message"><MessageSquare size={18} /></a>
        <button className="btn icon round" onClick={() => setFollow('done')} aria-label="Mark done"><Check size={18} /></button>
        <button className="btn icon round danger" onClick={block} aria-label="Block number"><Ban size={18} /></button>
      </div>

      {a.summary && (
        <div className="card glow">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <Sparkles size={18} color="var(--accent)" style={{ flex: 'none', marginTop: 2 }} />
            <div className="stack" style={{ gap: 8 }}>
              <p>{a.summary}</p>
              {(readIn?.summary || a.summaryLocal?.text) && (
                <p className="bubble-local">
                  <span className="xs muted">{LANG_SHORT[readIn?.lang || a.summaryLocal!.lang] || ''} · </span>
                  {readIn?.summary || a.summaryLocal!.text}
                </p>
              )}
            </div>
          </div>
          {multilingual && (
            <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
              <Languages size={14} className="muted" />
              {['en', ...langs].map(l => <span key={l} className="badge">{LANG_SHORT[l] || l}</span>)}
              <span className="xs muted">language{langs.length ? 's' : ''} spoken</span>
            </div>
          )}
        </div>
      )}

      {slots.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>What Vexa captured</h2></div>
          <div className="card">
            <dl className="kv">{slots.map(([k, v]) => <FragmentKV key={k} k={run?.slotLabels?.[k] || LABELS[k] || k.charAt(0).toUpperCase() + k.slice(1)} v={String(v)} />)}</dl>
            {run && (
              <p className="xs muted" style={{ marginTop: 12 }}>
                {run.turns} caller turn{run.turns === 1 ? '' : 's'} · {run.questionsAsked} question{run.questionsAsked === 1 ? '' : 's'} asked{run.slotsSkipped ? ` · ${run.slotsSkipped} answered before being asked` : ''}
              </p>
            )}
          </div>
        </div>
      )}

      {!!run?.actions?.length && (
        <div className="section">
          <div className="section-head"><h2>What happened</h2></div>
          <div className="card tight">
            {run.actions.map((act, i) => (
              <div key={i} className="list-row" style={{ cursor: 'default' }}>
                <span className={`avatar ${act.result?.status === 'failed' ? 'urgent' : act.result?.status === 'skipped' ? 'spam' : 'lead'}`} style={{ width: 34, height: 34 }}>
                  {act.result?.status === 'failed' ? <X size={15} /> : <CheckCircle2 size={15} />}
                </span>
                <div className="grow">
                  <h3>{ACTION_LABEL[act.type] || act.type}</h3>
                  <p className="xs muted">{act.result?.body || act.result?.detail || act.result?.status}</p>
                </div>
                <span className="badge">{act.result?.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {call.aiUsage && call.aiUsage.requests > 0 && (
        <div className="section">
          <div className="section-head"><h2>AI cost of this call</h2><span className="xs muted">{call.aiUsage.model}</span></div>
          <div className="stat-grid">
            <div className="stat"><div className="v">${call.aiUsage.costUsd.toFixed(4)}</div><div className="l">total</div></div>
            <div className="stat"><div className="v">{(call.aiUsage.inputTokens + call.aiUsage.outputTokens).toLocaleString()}</div><div className="l">tokens</div></div>
            <div className="stat"><div className="v">{call.aiUsage.requests}</div><div className="l">AI requests</div></div>
          </div>
          <p className="xs muted" style={{ marginTop: 8 }}>
            {Object.entries(call.aiUsage.byPurpose).map(([k, v]) => `${k}: ${v.requests}× · ${(v.inputTokens + v.outputTokens).toLocaleString()} tok · $${v.costUsd.toFixed(4)}`).join('  ·  ')}
          </p>
        </div>
      )}

      {draft && (
        <div className="section">
          <div className="section-head"><h2>Reply</h2><span className="xs muted">{draft.canSend ? 'Sends from your business number' : 'Opens your messages app'}</span></div>
          <div className="card stack">
            <textarea className="textarea" value={reply} onChange={e => setReply(e.target.value)} aria-label="Reply text" />
            <button className="btn primary block" onClick={sendText}><Send size={16} /> Send text</button>
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-head"><h2>Next time they call</h2></div>
        <div className="card stack">
          {(caller?.instructions || []).map((ins, i) => (
            <div key={i} className="row between">
              <p className="small">“{ins.text}”</p>
              <button className="btn ghost icon sm" aria-label="Remove note" onClick={() => saveCaller({ instructions: (caller?.instructions || []).filter((_, j) => j !== i) })}><X size={15} /></button>
            </div>
          ))}
          <div className="composer">
            <input className="input" placeholder="Message Vexa should pass on…" value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNote()} aria-label="Note for next call" />
            <button className="btn icon round" onClick={addNote} disabled={!note.trim()} aria-label="Save note"><Send size={16} /></button>
          </div>
          <label className="row between">
            <span className="small">Always put them straight through</span>
            <Toggle checked={!!caller?.alwaysTransfer} onChange={v => saveCaller({ alwaysTransfer: v }).then(() => toast(v ? 'They’ll be put through' : 'Back to screening'))} label="Always transfer" />
          </label>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>Recording</h2>{call.recording && <span className="xs muted">{formatDuration(Math.round(call.recording.durationSec))} · {call.recording.channels === 2 ? 'caller ◀ ▶ Vexa' : 'mono'}</span>}</div>
        {call.recording ? (
          <div className="card stack">
            {audioUrl
              ? <audio ref={audioRef} src={audioUrl} controls autoPlay preload="auto" style={{ width: '100%' }} />
              : <button className="btn primary block" onClick={() => loadAudio().catch(e => toast(e.message))}><Mic size={16} /> Play recording</button>}
            <div className="row between">
              <span className="xs muted">Tap any transcript line to jump to it</span>
              <button className="btn ghost sm" style={{ color: 'var(--danger)' }} onClick={deleteRecording}><Trash2 size={14} /> Delete audio</button>
            </div>
          </div>
        ) : (
          <div className="card"><p className="small muted">{call.isTest ? 'Test calls are typed or use your browser mic, so there’s no audio. Phone calls are recorded on both sides (caller + Vexa) when recording is on.' : 'No recording for this call. Turn recording on in Settings → Recording & privacy.'}</p></div>
        )}
      </div>

      <div className="section">
        <div className="stack" style={{ gap: 8, marginBottom: 10 }}>
          {(multilingual || readIn) && (
            <div className="row" style={{ gap: 8 }}>
              {(['both', 'original', 'english'] as const).map(v => (
                <button key={v} className={`chip ${view === v && !readIn ? 'active' : ''}`} onClick={() => { setView(v); setReadIn(null); setShowTranscript(true) }}>
                  {v === 'both' ? 'Both' : v === 'original' ? 'As spoken' : 'English'}
                </button>
              ))}
            </div>
          )}
          <select className="select" style={{ height: 38, fontSize: 13.5, borderRadius: 12 }} value={readIn?.lang || ''} disabled={translating}
            onChange={e => readInLanguage(e.target.value)} aria-label="Read transcript in">
            <option value="">{translating ? 'Translating…' : 'Read the whole call in…'}</option>
            {Object.keys(LANG_NAMES).filter(l => multilingual || l !== 'en').map(l => <option key={l} value={l}>{LANG_NAMES[l]}</option>)}
          </select>
        </div>
        <button className="btn block ghost" onClick={() => setShowTranscript(s => !s)}>
          {showTranscript ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {showTranscript ? 'Hide' : 'Show'} transcript ({call.transcript.length})
        </button>
        {showTranscript && (
          <div className="bubbles" style={{ marginTop: 10 }}>
            {call.transcript.map((t, i) => {
              const foreign = !!t.lang && t.lang !== 'en'
              const en = t.textEn || t.text
              const main = readIn ? readIn.lines[i] ?? t.text : view === 'english' ? en : t.text
              const second = readIn ? (readIn.lines[i] !== t.text ? t.text : null) : view === 'both' && foreign && en !== t.text ? en : null
              return (
                <div key={i} className={`bubble ${t.speaker === 'system' && t.text.startsWith('Owner:') ? 'owner' : t.speaker}`}
                  onClick={() => seekTo(t)} style={call.recording ? { cursor: 'pointer' } : undefined}>
                  {foreign && <span className="bubble-lang">{readIn ? 'Spoken in ' : ''}{LANG_SHORT[t.lang!] || t.lang}</span>}
                  {main}
                  {second && <div className="bubble-en">{second}</div>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <button className="btn block ghost" style={{ color: 'var(--danger)', marginTop: 8 }} onClick={remove}><Trash2 size={16} /> Delete call</button>
    </>
  )
}

function FragmentKV({ k, v }: { k: string; v: string }) {
  return <><dt>{k}</dt><dd>{v}</dd></>
}
