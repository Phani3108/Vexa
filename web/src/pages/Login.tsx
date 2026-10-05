import { useState, type FormEvent } from 'react'
import { ArrowLeft } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import Orb from '../components/Orb'

function normalize(input: string): string {
  const t = input.trim()
  const d = t.replace(/\D/g, '')
  if (t.startsWith('+')) return `+${d}`
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d.startsWith('1')) return `+${d}`
  return `+${d}`
}

export default function Login() {
  const { signIn } = useAuth()
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [dev, setDev] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function request(e?: FormEvent) {
    e?.preventDefault()
    setError(null)
    const n = normalize(phone)
    if (!/^\+[1-9]\d{6,14}$/.test(n)) return setError('Enter a valid mobile number')
    setBusy(true)
    try {
      const r = await api<{ sent: boolean; devCode?: string }>('/api/auth/otp/request', { method: 'POST', body: { phoneNumber: n }, auth: false })
      setPhone(n)
      setDev(!!r.devCode)
      if (r.devCode) setCode(r.devCode)
      setStep('code')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send code')
    } finally {
      setBusy(false)
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await api<{ token: string; refreshToken: string }>('/api/auth/otp/verify', {
        method: 'POST',
        body: { phoneNumber: phone, code: code.trim(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        auth: false,
      })
      await signIn(r.token, r.refreshToken)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="screen full" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div className="stack" style={{ justifyItems: 'center', gap: 16 }}>
          <Orb size={120} state={busy ? 'thinking' : 'idle'} />
          <div>
            <h1 style={{ fontSize: 34 }}>Vexa</h1>
            <p className="dim" style={{ marginTop: 8, maxWidth: 300 }}>Your AI receptionist. It answers when you can't, handles what it can, and only interrupts you when it matters.</p>
          </div>
        </div>
      </div>

      {step === 'phone' ? (
        <form className="stack" onSubmit={request}>
          <input className="input xl" type="tel" autoComplete="tel" placeholder="(415) 555-0123" value={phone} onChange={e => setPhone(e.target.value)} aria-label="Mobile number" autoFocus />
          {error && <div className="alert danger" role="alert">{error}</div>}
          <button className="btn primary block" style={{ height: 54 }} disabled={busy || !phone.trim()}>{busy ? 'Sending…' : 'Continue'}</button>
          <p className="xs muted" style={{ textAlign: 'center' }}>We’ll text you a 6-digit code. No password.</p>
        </form>
      ) : (
        <form className="stack" onSubmit={verify}>
          <button type="button" className="link row" style={{ justifySelf: 'start' }} onClick={() => { setStep('phone'); setCode(''); setError(null) }}><ArrowLeft size={15} /> {phone}</button>
          {dev && <div className="alert accent small">Dev mode: SMS skipped, code filled in.</div>}
          <input className="input xl code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Verification code" autoFocus />
          {error && <div className="alert danger" role="alert">{error}</div>}
          <button className="btn primary block" style={{ height: 54 }} disabled={busy || code.length < 6}>{busy ? 'Verifying…' : 'Verify'}</button>
          <button type="button" className="btn ghost block" onClick={() => request()} disabled={busy}>Resend code</button>
        </form>
      )}
    </main>
  )
}
