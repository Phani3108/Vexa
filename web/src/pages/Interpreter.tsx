import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Languages, Mic, MicOff, Send, Volume2, VolumeX, X } from 'lucide-react'
import QRCode from 'qrcode'
import { api, ApiError } from '../lib/api'
import { canListen, listen, speak, stopSpeaking, LANG_BCP47, LANG_NAMES, LANG_SHORT } from '../lib/speech'
import Orb from '../components/Orb'
import { TopBar, toast } from '../components/ui'

type Side = 'owner' | 'guest'
interface Msg { seq: number; from: Side; text: string; lang: string; translation: string; translationLang: string; translated: boolean; at: string }
interface RoomView { room: string; side: Side; langs: { owner: string; guest: string | null }; guestJoined: boolean; messages: Msg[] }

function LangSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <select className="select" style={{ height: 36, fontSize: 13, borderRadius: 10 }} value={value} onChange={e => onChange(e.target.value)} aria-label={label}>
      {Object.entries(LANG_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  )
}

/** The live two-language conversation, the same on both phones. */
function Room({ side, base, initial, onClose }: { side: Side; base: string; initial: RoomView; onClose?: () => void }) {
  const auth = side === 'owner'
  const [view, setView] = useState<RoomView>(initial)
  const [msgs, setMsgs] = useState<Msg[]>(initial.messages)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [voiceOn, setVoiceOn] = useState(true)
  const [listening, setListening] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  const last = useRef(initial.messages.at(-1)?.seq || 0)
  const stopListen = useRef<(() => void) | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const voiceRef = useRef(voiceOn)
  voiceRef.current = voiceOn
  const mine = view.langs[side] || 'en'
  const theirs = view.langs[side === 'owner' ? 'guest' : 'owner'] || 'en'
  const guestUrl = `${location.origin}/i/${view.room}`

  useEffect(() => {
    if (side === 'owner') QRCode.toDataURL(guestUrl, { width: 360, margin: 1 }).then(setQr).catch(() => {})
  }, [side, guestUrl])

  // Poll for the other person's messages; speak them in my language
  useEffect(() => {
    let stop = false
    const tick = async () => {
      try {
        const r = await api<RoomView>(`${base}${base.includes('?') ? '&' : '?'}after=${last.current}`, { auth })
        if (stop) return
        setView(v => ({ ...v, langs: r.langs, guestJoined: r.guestJoined }))
        const fresh = r.messages.filter(m => m.seq > last.current)
        if (fresh.length) {
          last.current = fresh.at(-1)!.seq
          setMsgs(m => [...m, ...fresh.filter(f => !m.some(x => x.seq === f.seq))])
          const heard = fresh.filter(m => m.from !== side).at(-1)
          if (heard && voiceRef.current) speak(heard.translation, undefined, LANG_BCP47[heard.translationLang] || 'en-IN')
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) { stop = true; toast('This conversation has ended') }
      }
    }
    const id = setInterval(tick, 1500)
    return () => { stop = true; clearInterval(id) }
  }, [base, auth, side])
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }) }, [msgs])

  const path = (suffix: string) => `${base}/${suffix}`

  async function send(text: string, e?: FormEvent) {
    e?.preventDefault()
    const t = text.trim()
    if (!t || busy) return
    stopSpeaking(); setInput(''); setBusy(true)
    try {
      const m = await api<Msg>(path('say'), { method: 'POST', body: { text: t }, auth })
      last.current = Math.max(last.current, m.seq)
      setMsgs(list => [...list.filter(x => x.seq !== m.seq), m])
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not send')
    } finally {
      setBusy(false)
    }
  }

  async function changeLang(l: string) {
    const r = await api<RoomView>(path('lang'), { method: 'PUT', body: { lang: l }, auth })
    setView(v => ({ ...v, langs: r.langs }))
  }

  function mic() {
    if (listening) { stopListen.current?.(); setListening(false); return }
    stopSpeaking(); setListening(true)
    stopListen.current = listen((t, final) => { setInput(t); if (final) { setListening(false); send(t) } }, () => setListening(false), LANG_BCP47[mine])
  }

  return (
    <div className="call-screen">
      <div className="call-hero" style={{ gap: 8 }}>
        <Orb size={msgs.length ? 48 : 80} state={busy ? 'thinking' : 'idle'}><Languages size={20} /></Orb>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <span className="xs muted">I speak</span>
          <LangSelect value={mine} onChange={changeLang} label="My language" />
          <span className="xs muted">· they hear {LANG_SHORT[theirs] || theirs}</span>
        </div>
        {side === 'owner' && !view.guestJoined && (
          <div className="card stack" style={{ gap: 8, alignItems: 'center', marginTop: 4 }}>
            <p className="small">Ask the other person to scan this, or send them the link</p>
            {qr && <div className="qr-box"><img src={qr} alt="QR code to join the conversation" style={{ width: 180, height: 180 }} /></div>}
            <button className="btn sm" onClick={() => navigator.share ? navigator.share({ url: guestUrl }).catch(() => {}) : navigator.clipboard.writeText(guestUrl).then(() => toast('Link copied'))}>Share link</button>
          </div>
        )}
        {side === 'owner' && view.guestJoined && <span className="badge live">Connected</span>}
      </div>

      <div className="call-log" ref={logRef} aria-live="polite">
        <div className="bubbles">
          {msgs.map(m => {
            const own = m.from === side
            return (
              <div key={m.seq} className={`bubble ${own ? 'caller' : 'ai'}`}>
                {own ? m.text : m.translation}
                <div className="bubble-en">{own ? `They heard: ${m.translation}` : `${LANG_SHORT[m.lang] || m.lang}: ${m.text}`}{m.translated ? '' : ' (not translated)'}</div>
              </div>
            )
          })}
          {busy && <div className="bubble caller"><span className="typing-dots"><i /><i /><i /></span></div>}
        </div>
      </div>

      <div className="dock">
        <form className="composer" onSubmit={e => send(input, e)}>
          <button type="button" className="btn icon round" onClick={() => { setVoiceOn(v => !v); stopSpeaking() }} aria-label={voiceOn ? 'Mute' : 'Unmute'}>{voiceOn ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
          <input className="input" placeholder={listening ? 'Listening…' : `Speak ${LANG_SHORT[mine] || ''}…`} value={input} onChange={e => setInput(e.target.value)} aria-label="Your words" maxLength={600} />
          {canListen() && <button type="button" className={`btn icon round ${listening ? 'primary' : ''}`} onClick={mic} aria-label={listening ? 'Stop' : 'Talk'}>{listening ? <MicOff size={18} /> : <Mic size={18} />}</button>}
          <button className="btn icon round primary" disabled={!input.trim() || busy} aria-label="Send"><Send size={17} /></button>
        </form>
        {onClose && <button className="btn sm ghost" onClick={onClose}><X size={14} /> End conversation</button>}
        <p className="xs muted" style={{ textAlign: 'center' }}>Translated by AI · not saved after the conversation</p>
      </div>
    </div>
  )
}

/** Owner: open a room in your language and share it. */
export default function Interpreter() {
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('vexa.interpLang') || 'te' } catch { return 'te' } })
  const [guestLang, setGuestLang] = useState('hi')
  const [room, setRoom] = useState<RoomView | null>(null)

  async function open() {
    try { localStorage.setItem('vexa.interpLang', lang) } catch { /* private mode */ }
    setRoom(await api<RoomView>('/api/interpreter', { method: 'POST', body: { lang, guestLang } }))
  }
  async function close() {
    if (room) await api(`/api/interpreter/${room.room}`, { method: 'DELETE' }).catch(() => {})
    stopSpeaking(); setRoom(null)
  }

  if (room) return <Room side="owner" base={`/api/interpreter/${room.room}`} initial={room} onClose={close} />
  return (
    <>
      <TopBar title="Interpreter" />
      <p className="small dim" style={{ marginBottom: 14 }}>Talk with someone who speaks another language — a tenant, a worker, a customer. Each of you speaks your own language on your own phone; Vexa translates both ways and reads it out.</p>
      <div className="card stack" style={{ gap: 12 }}>
        <div className="row between"><span>I speak</span><LangSelect value={lang} onChange={setLang} label="My language" /></div>
        <div className="row between"><span>They speak</span><LangSelect value={guestLang} onChange={setGuestLang} label="Their language" /></div>
        <button className="btn primary" onClick={open}><Languages size={16} /> Start</button>
      </div>
    </>
  )
}

/** Guest: opened from the shared link or QR, no sign-in. */
export function InterpreterGuest() {
  const { room = '' } = useParams()
  const base = `/api/public/interpreter/${encodeURIComponent(room)}`
  const [lang, setLang] = useState<string | null>(null)
  const [view, setView] = useState<RoomView | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<RoomView>(base, { auth: false }).then(r => setLang(r.langs.guest || 'hi')).catch(e => setError(e instanceof ApiError ? e.message : 'This conversation is not available'))
  }, [base])

  async function join() {
    try { setView(await api<RoomView>(`${base}/join`, { method: 'POST', body: { lang }, auth: false })) } catch (e) { setError(e instanceof Error ? e.message : 'Could not join') }
  }

  if (error) return <div className="center-page"><Orb size={72} /><h2>Conversation not available</h2><p className="dim small">{error}</p></div>
  if (view) return <Room side="guest" base={base} initial={view} />
  return (
    <div className="center-page">
      <Orb size={84}><Languages size={24} /></Orb>
      <h2>Live interpreter</h2>
      <p className="dim small">Speak your language — the other person hears theirs.</p>
      {lang && <LangSelect value={lang} onChange={setLang} label="Your language" />}
      <button className="btn primary" onClick={join} disabled={!lang}>Join</button>
    </div>
  )
}
