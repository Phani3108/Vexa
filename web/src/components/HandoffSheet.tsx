import { PhoneCall, PhoneOff, Sparkles } from 'lucide-react'
import { api } from '../lib/api'
import { useLive } from '../lib/live'
import { formatPhone, initials } from '../lib/format'
import Orb from './Orb'
import { toast } from './ui'

/**
 * Full-screen "pick up or let Vexa handle it" prompt, shown when a call needs the owner:
 * a trusted contact calling during Focus, or Vexa handing a call off (e.g. delivery OTP).
 */
export default function HandoffSheet() {
  const { handoff, dismissHandoff } = useLive()
  if (!handoff) return null

  async function pickUp() {
    if (handoff!.isTest) {
      toast('Test call — on a real call your phone would ring now')
    } else {
      await api('/voice/takeover', { method: 'POST', body: { callId: handoff!.callId } }).then(() => toast('Calling your phone…')).catch(e => toast(e.message))
    }
    dismissHandoff()
  }

  const who = handoff.callerName || formatPhone(handoff.callerNumber)
  return (
    <div className="handoff" role="alertdialog" aria-label={handoff.title}>
      <div className="handoff-inner">
        <span className="badge live"><span className="dot pulse" />{handoff.kind === 'vip' ? 'Trusted contact' : 'Handoff request'}{handoff.isTest ? ' · test' : ''}</span>
        <div className="avatar lg" style={{ marginTop: 18 }}>{handoff.callerName ? initials(handoff.callerName) : <PhoneCall size={26} />}</div>
        <h1 style={{ fontSize: 26, marginTop: 12 }}>{handoff.title}</h1>
        <p className="dim" style={{ marginTop: 6 }}>{who !== handoff.title ? `${who} · ` : ''}{handoff.detail}</p>
        {handoff.facts.length > 0 && (
          <div className="card" style={{ marginTop: 16, textAlign: 'left', width: '100%' }}>
            <div className="row" style={{ marginBottom: 6 }}><Sparkles size={14} color="var(--accent)" /><span className="eyebrow">Vexa's brief</span></div>
            {handoff.facts.map(f => <p key={f} className="small">{f}</p>)}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <Orb size={56} state="speaking" />
        <div className="row" style={{ gap: 28, marginTop: 22 }}>
          <div className="stack" style={{ alignItems: 'center', gap: 6 }}>
            <button className="btn icon round danger" style={{ width: 64, height: 64 }} onClick={dismissHandoff} aria-label="Let Vexa handle it"><PhoneOff size={24} /></button>
            <span className="xs dim">Let Vexa handle</span>
          </div>
          <div className="stack" style={{ alignItems: 'center', gap: 6 }}>
            <button className="btn icon round" style={{ width: 64, height: 64, background: 'var(--ok)', color: '#fff', border: 0 }} onClick={pickUp} aria-label="Pick up"><PhoneCall size={24} /></button>
            <span className="xs dim">Pick up</span>
          </div>
        </div>
      </div>
    </div>
  )
}
