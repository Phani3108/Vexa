import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mic, MicOff, PhoneCall, Send } from 'lucide-react'
import Sheet from './Sheet'
import Orb from './Orb'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { canListen, listen } from '../lib/speech'

interface Msg { who: 'you' | 'vexa'; text: string }

const BUSINESS_SUGGESTIONS = ['What did I miss?', 'Tell Dana her parts arrived', 'Focus for 2 hours', 'Always put Mom straight through', 'Turn on spam shield', 'Turn off the job applicant flow']
const PERSONAL_SUGGESTIONS = ['What did I miss?', 'Focus until 5pm', 'Tell Mom I’ll call after my meeting', 'Always put Alex straight through', 'Turn on spam shield', 'Block +1 800 555 0199']

export default function AskSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { config, reloadConfig } = useAuth()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const stopRef = useRef<(() => void) | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }) }, [msgs, busy])
  useEffect(() => { if (!open) { stopRef.current?.(); setListening(false) } }, [open])

  async function run(command: string, e?: FormEvent) {
    e?.preventDefault()
    const c = command.trim()
    if (!c || busy) return
    setText('')
    setMsgs(m => [...m, { who: 'you', text: c }])
    setBusy(true)
    try {
      const r = await api<{ reply: string; done: { type: string }[] }>('/api/assistant/command', { method: 'POST', body: { text: c } })
      setMsgs(m => [...m, { who: 'vexa', text: r.reply }])
      if (r.done.some(d => ['shield', 'flow_toggle', 'vip_add', 'block', 'unblock'].includes(d.type))) reloadConfig()
    } catch (err) {
      setMsgs(m => [...m, { who: 'vexa', text: err instanceof Error ? err.message : 'Something went wrong' }])
    } finally {
      setBusy(false)
    }
  }

  function toggleMic() {
    if (listening) { stopRef.current?.(); setListening(false); return }
    setListening(true)
    stopRef.current = listen((t, final) => { setText(t); if (final) { setListening(false); run(t) } }, () => setListening(false))
  }

  const suggestions = config?.accountType === 'personal' ? PERSONAL_SUGGESTIONS : BUSINESS_SUGGESTIONS

  return (
    <Sheet open={open} onClose={onClose} label="Ask Vexa">
      <div className="row" style={{ marginBottom: 14 }}>
        <Orb size={44} state={busy ? 'thinking' : listening ? 'speaking' : 'idle'} />
        <div className="grow">
          <h2>Ask Vexa</h2>
          <p className="small muted">Tell your receptionist what to do, in plain words.</p>
        </div>
      </div>

      <div ref={logRef} className="bubbles" style={{ maxHeight: 260, overflowY: 'auto', marginBottom: msgs.length ? 12 : 0 }}>
        {msgs.map((m, i) => <div key={i} className={`bubble ${m.who === 'you' ? 'caller' : 'ai'}`}>{m.text}</div>)}
        {busy && <div className="bubble ai"><span className="typing-dots"><i /><i /><i /></span></div>}
      </div>

      {msgs.length === 0 && (
        <div className="chips" style={{ marginBottom: 12, flexWrap: 'wrap', overflow: 'visible' }}>
          {suggestions.map(s => <button key={s} className="chip" onClick={() => run(s)}>{s}</button>)}
        </div>
      )}

      <form className="composer" onSubmit={e => run(text, e)}>
        <input className="input" placeholder={listening ? 'Listening…' : 'e.g. Tell Dana her parts arrived'} value={text} onChange={e => setText(e.target.value)} aria-label="Command" autoFocus />
        {canListen() && (
          <button type="button" className={`btn icon round ${listening ? 'primary' : ''}`} onClick={toggleMic} aria-label={listening ? 'Stop listening' : 'Speak'}>
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        )}
        <button className="btn icon round primary" disabled={!text.trim() || busy} aria-label="Send"><Send size={18} /></button>
      </form>

      <button className="btn block" style={{ marginTop: 14 }} onClick={() => { onClose(); navigate('/test') }}>
        <PhoneCall size={17} /> Call my receptionist (test call)
      </button>
    </Sheet>
  )
}
