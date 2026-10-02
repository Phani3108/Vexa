import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Briefcase, Building2, Car, ChevronLeft, Coffee, HeartPulse, Home, Scissors, ShoppingBag, User, Wrench } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { BusinessHours, UserConfig } from '../lib/types'
import { VOICES } from '../lib/format'
import HoursEditor from '../components/HoursEditor'
import Orb from '../components/Orb'
import { Field } from '../components/ui'

const ICONS: Record<string, typeof Home> = {
  home_services: Wrench, clinic: HeartPulse, salon: Scissors, restaurant: Coffee, professional: Briefcase,
  real_estate: Building2, auto: Car, retail: ShoppingBag, other: Home,
}
const SHORT: Record<string, string> = {
  home_services: 'Home services', clinic: 'Clinic / dental', salon: 'Salon / spa', restaurant: 'Restaurant',
  professional: 'Legal / accounting', real_estate: 'Real estate', auto: 'Auto', retail: 'Retail', other: 'Other',
}
const DEFAULT_HOURS: BusinessHours[] = [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, open: '09:00', close: '17:00', closed: day === 0 || day === 6 }))

export default function Onboarding() {
  const { config, setConfig } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'personal' | 'business' | null>((params.get('mode') as 'business') || null)
  const [step, setStep] = useState(params.get('mode') ? 1 : 0)
  const [industries, setIndustries] = useState<{ id: string; label: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(config?.name && config.name !== 'User' ? config.name : '')
  const [biz, setBiz] = useState(config?.businessProfile?.businessName || '')
  const [industry, setIndustry] = useState(config?.businessProfile?.industry && config.businessProfile.industry !== 'other' ? config.businessProfile.industry : 'home_services')
  const [hours, setHours] = useState<BusinessHours[]>(config?.businessProfile?.hours?.length ? config.businessProfile.hours : DEFAULT_HOURS)
  const [transfer, setTransfer] = useState(config?.businessProfile?.transferNumber || config?.phoneNumber || '')
  const [street, setStreet] = useState(config?.deliveryAddress?.street || '')
  const [flat, setFlat] = useState(config?.deliveryAddress?.flat || '')
  const [city, setCity] = useState(config?.deliveryAddress?.city || '')
  const [voice, setVoice] = useState(config?.aiSettings?.voice || 'shimmer')

  useEffect(() => { api<{ industries: { id: string; label: string }[] }>('/api/users/templates').then(r => setIndustries(r.industries)).catch(() => {}) }, [])

  const total = 4
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const canNext = step === 1 ? (mode === 'business' ? biz.trim().length > 1 : name.trim().length > 0) : true

  async function finish() {
    setBusy(true)
    setError(null)
    try {
      const body = mode === 'personal'
        ? { accountType: 'personal', name: name.trim(), aiSettings: { voice }, deliveryAddress: { street, flat, city }, businessProfile: { timezone } }
        : { industry, name: name.trim() || undefined, aiSettings: { voice }, businessProfile: { businessName: biz.trim(), hours, timezone, transferNumber: transfer.trim() } }
      const { config: c } = await api<{ config: UserConfig }>('/api/users/onboarding', { method: 'POST', body })
      setConfig(c)
      navigate('/test?welcome=1', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="screen full" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="row">
        {step > 0 ? <button className="back" onClick={() => setStep(s => s - 1)} aria-label="Back"><ChevronLeft size={20} /></button> : <span style={{ width: 40 }} />}
        <div className="steps-dots grow">{Array.from({ length: total }, (_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
        <span style={{ width: 40 }} />
      </div>

      {step === 0 && (
        <>
          <div style={{ display: 'grid', justifyItems: 'center', textAlign: 'center', gap: 12, marginTop: 12 }}>
            <Orb size={88} />
            <h1>Who should Vexa answer for?</h1>
            <p className="dim">You can switch any time.</p>
          </div>
          <button className={`choice${mode === 'personal' ? ' active' : ''}`} onClick={() => { setMode('personal'); setStep(1) }}>
            <User size={22} color="var(--accent)" />Just me
            <span className="sub">Screens unknown callers, handles deliveries, shuts down spam, protects your focus time.</span>
          </button>
          <button className={`choice${mode === 'business' ? ' active' : ''}`} onClick={() => { setMode('business'); setStep(1) }}>
            <Building2 size={22} color="var(--live)" />My business
            <span className="sub">A receptionist that answers questions, captures leads, books appointments and escalates emergencies.</span>
          </button>
        </>
      )}

      {step === 1 && mode === 'personal' && (
        <>
          <div><h1>What should Vexa call you?</h1><p className="dim" style={{ marginTop: 6 }}>Callers hear “You’ve reached {name ? name.split(' ')[0] : 'Sam'}’s assistant.”</p></div>
          <input className="input xl" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} autoFocus />
        </>
      )}

      {step === 1 && mode === 'business' && (
        <>
          <div><h1>Tell us about your business</h1><p className="dim" style={{ marginTop: 6 }}>We’ll load proven call flows for your industry.</p></div>
          <Field label="Business name"><input className="input" value={biz} onChange={e => setBiz(e.target.value)} placeholder="Bright Plumbing Co." autoFocus /></Field>
          <Field label="Your name"><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Maria Garcia" /></Field>
          <div className="choice-grid">
            {(industries.length ? industries : Object.keys(SHORT).map(id => ({ id, label: SHORT[id] }))).map(ind => {
              const Icon = ICONS[ind.id] || Home
              return (
                <button key={ind.id} className={`choice${industry === ind.id ? ' active' : ''}`} onClick={() => setIndustry(ind.id)} style={{ padding: 12 }}>
                  <Icon size={18} />{SHORT[ind.id] || ind.label}
                </button>
              )
            })}
          </div>
        </>
      )}

      {step === 2 && mode === 'personal' && (
        <>
          <div><h1>Where do deliveries go?</h1><p className="dim" style={{ marginTop: 6 }}>Couriers get directions instantly — you’re only pulled in for codes or signatures. Optional.</p></div>
          <Field label="Street"><input className="input" value={street} onChange={e => setStreet(e.target.value)} placeholder="9 Oak Ave" /></Field>
          <div className="row"><Field label="Apt / unit"><input className="input" value={flat} onChange={e => setFlat(e.target.value)} placeholder="4B" /></Field><Field label="City"><input className="input" value={city} onChange={e => setCity(e.target.value)} placeholder="Austin" /></Field></div>
        </>
      )}

      {step === 2 && mode === 'business' && (
        <>
          <div><h1>When are you open?</h1><p className="dim" style={{ marginTop: 6 }}>After hours, Vexa tells callers when you reopen and still captures every lead.</p></div>
          <div className="card"><HoursEditor hours={hours} onChange={setHours} /></div>
          <Field label="Urgent calls ring" hint="Your mobile or front desk"><input className="input" value={transfer} onChange={e => setTransfer(e.target.value)} /></Field>
        </>
      )}

      {step === 3 && (
        <>
          <div><h1>Pick a voice</h1><p className="dim" style={{ marginTop: 6 }}>How Vexa sounds on the phone.</p></div>
          <div className="choice-grid">
            {VOICES.map(v => <button key={v.id} className={`choice${voice === v.id ? ' active' : ''}`} onClick={() => setVoice(v.id)}>{v.label}<span className="sub">{v.hint}</span></button>)}
          </div>
          <div className="alert accent small">Next: a test call. You play the caller — type or talk — and watch Vexa work.</div>
        </>
      )}

      {error && <div className="alert danger">{error}</div>}
      <div style={{ flex: 1 }} />
      {step > 0 && (
        step < total - 1
          ? <button className="btn primary block" style={{ height: 54 }} disabled={!canNext} onClick={() => setStep(s => s + 1)}>Continue</button>
          : <button className="btn primary block" style={{ height: 54 }} disabled={busy} onClick={finish}>{busy ? 'Setting up…' : 'Start my receptionist'}</button>
      )}
    </main>
  )
}
