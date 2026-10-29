import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { IndianRupee, Mic, MicOff, RotateCcw, Send, Volume2, VolumeX } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { canListen, listen, speak, stopSpeaking, LANG_BCP47, LANG_NAMES } from '../lib/speech'
import Orb from '../components/Orb'
import { PageLoader } from '../components/ui'

interface Info { name: string; description: string; accountType: string; language: string; open: boolean | null; nextOpen: string | null }
interface Line { who: 'ai' | 'caller' | 'system'; text: string }

/** Vexa Link: anyone with the link (or QR) talks to the receptionist — no app, no sign-in. */
export default function Talk() {
  const { slug = '' } = useParams()
  const base = `/api/public/link/${encodeURIComponent(slug)}`
  const [info, setInfo] = useState<Info | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sid, setSid] = useState<string | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [ended, setEnded] = useState(false)
  const [voiceOn, setVoiceOn] = useState(true)
  const [speaking, setSpeaking] = useState(false)
  const [listening, setListening] = useState(false)
  const [lang, setLang] = useState('en')
  const [pay, setPay] = useState<{ amount: number; url: string } | null>(null)
  const stopListen = useRef<(() => void) | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api<Info>(base, { auth: false }).then(i => { setInfo(i); setLang(i.language || 'en') }).catch(e => setError(e instanceof ApiError ? e.message : 'This link is not available'))
  }, [base])
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }) }, [lines, busy])
  // End the conversation when the visitor leaves, so it is saved for the owner
  useEffect(() => {
    if (!sid || ended) return
    const bye = () => navigator.sendBeacon?.(`${base}/${sid}/end`)
    window.addEventListener('pagehide', bye)
    return () => window.removeEventListener('pagehide', bye)
  }, [sid, ended, base])

  function say(text: string, l: string) {
    if (!voiceOn) return
    setSpeaking(true)
    speak(text, () => setSpeaking(false), LANG_BCP47[l] || 'en-IN')
  }

  async function begin() {
    setBusy(true); setError(null); setEnded(false); setPay(null)
    try {
      const r = await api<{ sessionId: string; greeting: string; language: string }>(`${base}/start`, { method: 'POST', body: {}, auth: false })
      setSid(r.sessionId)
      setLines([{ who: 'ai', text: r.greeting }])
      say(r.greeting, r.language)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not connect. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function send(text: string, e?: FormEvent) {
    e?.preventDefault()
    const t = text.trim()
    if (!t || !sid || busy || ended) return
    stopSpeaking()
    setInput('')
    setLines(l => [...l, { who: 'caller', text: t }])
    setBusy(true)
    try {
      const r = await api<{ reply: string; language: string; ended: boolean; pay?: { amount: number; url: string } | null }>(`${base}/${sid}/message`, { method: 'POST', body: { text: t }, auth: false })
      setLines(l => [...l, { who: 'ai', text: r.reply }])
      say(r.reply, r.language)
      if (r.pay) setPay(r.pay)
      if (r.ended) { setEnded(true); setLines(l => [...l, { who: 'system', text: 'Conversation ended' }]) }
    } catch (err) {
      setLines(l => [...l, { who: 'system', text: err instanceof ApiError ? err.message : 'Connection problem — please try again.' }])
      if (err instanceof ApiError && err.status === 404) setEnded(true)
    } finally {
      setBusy(false)
    }
  }

  async function hangUp() {
    if (sid && !ended) await api(`${base}/${sid}/end`, { method: 'POST', body: {}, auth: false }).catch(() => {})
    stopSpeaking(); stopListen.current?.()
    setEnded(true)
    setLines(l => [...l, { who: 'system', text: 'Conversation ended' }])
  }

  function mic() {
    if (listening) { stopListen.current?.(); setListening(false); return }
    stopSpeaking()
    setListening(true)
    stopListen.current = listen((t, final) => { setInput(t); if (final) { setListening(false); send(t) } }, () => setListening(false), LANG_BCP47[lang])
  }

  if (error && !info) {
    return <div className="center-page"><Orb size={72} /><h2>Link not available</h2><p className="dim small">{error}</p></div>
  }
  if (!info) return <PageLoader />

  const orb = busy ? 'thinking' : speaking ? 'speaking' : 'idle'
  return (
    <div className="call-screen talk">
      <div className="call-hero">
        <Orb size={lines.length > 2 ? 56 : 92} state={orb} />
        <div className="name">{info.name}</div>
        {info.description && lines.length < 2 && <p className="small dim" style={{ maxWidth: 340, textAlign: 'center' }}>{info.description}</p>}
        <div className="row" style={{ gap: 6 }}>
          {info.open != null && <span className={`badge ${info.open ? 'live' : ''}`}>{info.open ? 'Open now' : `Closed${info.nextOpen ? ` · opens ${info.nextOpen}` : ''}`}</span>}
          <span className="badge">AI assistant</span>
        </div>
      </div>

      <div className="call-log" ref={logRef} aria-live="polite">
        <div className="bubbles">
          {lines.map((l, i) => <div key={i} className={`bubble ${l.who}`}>{l.text}</div>)}
          {busy && sid && <div className="bubble ai"><span className="typing-dots"><i /><i /><i /></span></div>}
        </div>
        {pay && (
          <a className="btn primary block" style={{ marginTop: 14 }} href={pay.url}><IndianRupee size={16} /> Pay ₹{pay.amount.toLocaleString('en-IN')} with any UPI app</a>
        )}
        {error && <p className="small" style={{ color: 'var(--danger)', textAlign: 'center', marginTop: 12 }}>{error}</p>}
      </div>

      <div className="dock">
        {!sid || ended ? (
          <button className="btn primary block" onClick={begin} disabled={busy}>{ended ? <><RotateCcw size={16} /> Start again</> : <><Mic size={16} /> Talk to {info.accountType === 'personal' ? 'the assistant' : 'us'}</>}</button>
        ) : (
          <>
            <div className="row" style={{ gap: 8 }}>
              <span className="xs muted" style={{ flex: 'none' }}>I speak</span>
              <select className="select" style={{ height: 34, fontSize: 13, borderRadius: 10 }} value={lang} onChange={e => setLang(e.target.value)} aria-label="Your language">
                {Object.entries(LANG_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={hangUp}>End</button>
            </div>
            <form className="composer" onSubmit={e => send(input, e)}>
              <button type="button" className="btn icon round" onClick={() => { setVoiceOn(v => !v); stopSpeaking() }} aria-label={voiceOn ? 'Mute' : 'Unmute'}>{voiceOn ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
              <input className="input" placeholder={listening ? 'Listening…' : 'Type or tap the mic…'} value={input} onChange={e => setInput(e.target.value)} aria-label="Your message" maxLength={500} />
              {canListen() && <button type="button" className={`btn icon round ${listening ? 'primary' : ''}`} onClick={mic} aria-label={listening ? 'Stop' : 'Talk'}>{listening ? <MicOff size={18} /> : <Mic size={18} />}</button>}
              <button className="btn icon round primary" disabled={!input.trim() || busy} aria-label="Send"><Send size={17} /></button>
            </form>
          </>
        )}
        <p className="xs muted" style={{ textAlign: 'center' }}>Answered by an AI assistant · Powered by Vexa · Don't share OTPs, PINs or card details</p>
      </div>
    </div>
  )
}
