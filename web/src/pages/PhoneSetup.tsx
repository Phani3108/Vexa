import { Check, Copy } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { formatPhone } from '../lib/format'
import { toast } from '../components/ui'

function Copyable({ text }: { text: string }) {
  return (
    <div className="row">
      <span className="code-block grow">{text}</span>
      <button className="btn icon sm" aria-label="Copy" onClick={() => { navigator.clipboard?.writeText(text); toast('Copied') }}><Copy size={14} /></button>
    </div>
  )
}

function Step({ n, done, title, children }: { n: number; done?: boolean; title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginTop: 0 }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <span className={`avatar ${done ? 'lead' : ''}`} style={{ width: 30, height: 30, fontSize: 13 }}>{done ? <Check size={15} /> : n}</span>
        <div className="grow stack" style={{ gap: 8 }}>
          <h3>{title}</h3>
          {children}
        </div>
      </div>
    </div>
  )
}

export default function PhoneSetup() {
  const { config, meta } = useAuth()
  const number = config?.twilioNumber || meta?.twilioNumber || null
  const digits = number?.replace(/\D/g, '') || ''
  const webhook = meta?.webhookUrl ? `${meta.webhookUrl}/voice/incoming-call` : null

  return (
    <div className="stack">
      <div className="stat-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="stat"><div className="l">Voice line</div><div style={{ marginTop: 6 }}>{meta?.voiceEnabled ? <span className="badge ok"><span className="dot" />Online</span> : <span className="badge warn"><span className="dot" />Not connected</span>}</div></div>
        <div className="stat"><div className="l">AI understanding</div><div style={{ marginTop: 6 }}>{meta?.aiEnabled ? <span className="badge ok"><span className="dot" />Connected</span> : <span className="badge warn"><span className="dot" />Offline engine</span>}</div></div>
      </div>
      {number && <div className="card"><div className="eyebrow">Your Vexa number</div><h2 style={{ marginTop: 6 }}>{formatPhone(number)}</h2></div>}

      <Step n={1} done={!!meta?.voiceEnabled} title="Connect telephony (one-time)">
        <p className="small muted">Set <code>OPENAI_API_KEY</code>, <code>TWILIO_*</code> and <code>WEBHOOK_URL</code> on the server, then point the Twilio number’s voice webhook to:</p>
        {webhook ? <Copyable text={webhook} /> : <span className="code-block">https://YOUR-SERVER/voice/incoming-call</span>}
      </Step>
      <Step n={2} done={!!number && !!meta?.voiceEnabled} title="Forward your phone to Vexa">
        <p className="small muted">Keep your number. Vexa answers only when you don’t. Dial from your phone:</p>
        {digits ? (
          <div className="stack" style={{ gap: 8 }}>
            <span className="xs muted">When busy / unanswered / unreachable</span><Copyable text={`*004*${digits}#`} />
            <span className="xs muted">Verizon (no answer)</span><Copyable text={`*71${digits}`} />
            <span className="xs muted">Turn off</span><Copyable text="##004#   (Verizon: *73)" />
          </div>
        ) : <p className="small muted">Codes appear here once telephony is connected.</p>}
      </Step>
      <Step n={3} title="Call yourself to test">
        <p className="small muted">Let it ring through. The live call appears on Home and you can steer it with Copilot.</p>
      </Step>
    </div>
  )
}
