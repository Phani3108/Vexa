import { useEffect, useState, type FormEvent } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Ban, Plus, Star, Trash2, Users, X } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { BusinessHours, BusinessProfile, CallerProfile, CatalogItem, UserConfig, VipContact } from '../lib/types'
import { formatPhone, initials, relativeTime, VOICES } from '../lib/format'
import HoursEditor from '../components/HoursEditor'
import { LANG_NAMES } from '../lib/speech'
import PhoneSetup from './PhoneSetup'
import { Empty, Field, PageLoader, Toggle, TopBar, toast } from '../components/ui'

function useSave() {
  const { setConfig } = useAuth()
  const [saving, setSaving] = useState(false)
  async function save(body: Record<string, unknown>, msg = 'Saved') {
    setSaving(true)
    try {
      const { config } = await api<{ config: UserConfig }>('/api/users/config', { method: 'PUT', body })
      setConfig(config)
      toast(msg)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }
  return { save, saving }
}

function profileOf(c: UserConfig): BusinessProfile {
  return { businessName: '', industry: 'other', description: '', website: '', email: '', bookingUrl: '', address: '', services: [], faqs: [], hours: [], timezone: '', afterHoursMessage: '', transferNumber: '', ...(c.businessProfile as Partial<BusinessProfile>) }
}

function Business({ config }: { config: UserConfig }) {
  const { save, saving } = useSave()
  const [p, setP] = useState(profileOf(config))
  const [name, setName] = useState(config.name)
  const f = (k: keyof BusinessProfile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setP({ ...p, [k]: e.target.value })
  return (
    <div className="stack">
      <Field label="Business name"><input className="input" value={p.businessName} onChange={f('businessName')} /></Field>
      <Field label="Your name"><input className="input" value={name} onChange={e => setName(e.target.value)} /></Field>
      <Field label="About" hint="Used when callers ask what you do."><textarea className="textarea" value={p.description} onChange={f('description')} /></Field>
      <Field label="Address"><input className="input" value={p.address} onChange={f('address')} /></Field>
      <Field label="Directions" hint="Spoken to callers who ask how to reach you — landmarks, parking."><textarea className="textarea" style={{ minHeight: 64 }} value={p.directions || ''} onChange={f('directions')} /></Field>
      <Field label="Currency"><select className="select" value={p.currency || 'USD'} onChange={e => setP({ ...p, currency: e.target.value })}>{['USD', 'INR', 'GBP', 'EUR', 'AED', 'CAD', 'AUD'].map(c => <option key={c}>{c}</option>)}</select></Field>
      <Field label="Website"><input className="input" value={p.website} onChange={f('website')} /></Field>
      <Field label="Email" hint="Given to job applicants and vendors."><input className="input" type="email" value={p.email} onChange={f('email')} /></Field>
      <Field label="Booking link" hint="Texted to callers who want an appointment."><input className="input" value={p.bookingUrl} onChange={f('bookingUrl')} /></Field>
      <Field label="Transfer calls to" hint="Your mobile or front desk, e.g. +14155550123"><input className="input" value={p.transferNumber} onChange={f('transferNumber')} /></Field>
      <button className="btn primary block" disabled={saving} onClick={() => save({ name, businessProfile: { businessName: p.businessName, description: p.description, address: p.address, directions: p.directions, currency: p.currency, website: p.website, email: p.email, bookingUrl: p.bookingUrl, transferNumber: p.transferNumber } })}>Save</button>
    </div>
  )
}

function Knowledge({ config }: { config: UserConfig }) {
  const { save, saving } = useSave()
  const p = profileOf(config)
  const [services, setServices] = useState(p.services)
  const [svc, setSvc] = useState('')
  const [faqs, setFaqs] = useState(p.faqs)
  return (
    <div className="stack">
      <h2>Services</h2>
      <div className="row wrap" style={{ gap: 6 }}>
        {services.map((s, i) => <span key={i} className="chip">{s}<button className="btn ghost icon sm" style={{ width: 18, height: 18 }} onClick={() => setServices(services.filter((_, j) => j !== i))} aria-label={`Remove ${s}`}><X size={12} /></button></span>)}
      </div>
      <form className="composer" onSubmit={e => { e.preventDefault(); if (svc.trim()) { setServices([...services, svc.trim()]); setSvc('') } }}>
        <input className="input" placeholder="e.g. Drain cleaning — from $149" value={svc} onChange={e => setSvc(e.target.value)} />
        <button className="btn icon round" aria-label="Add service"><Plus size={16} /></button>
      </form>

      <div className="row between section"><h2>FAQs</h2><button className="link" onClick={() => setFaqs([...faqs, { question: '', answer: '' }])}>+ Add</button></div>
      <p className="small muted">Vexa answers these mid-call, then picks the conversation back up. Anything not here, it promises a callback instead of guessing.</p>
      {faqs.map((q, i) => (
        <div key={i} className="card stack" style={{ marginTop: 0, gap: 8 }}>
          <div className="row">
            <input className="input" placeholder="Question" value={q.question} onChange={e => setFaqs(faqs.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} />
            <button className="btn ghost icon sm" onClick={() => setFaqs(faqs.filter((_, j) => j !== i))} aria-label="Remove FAQ"><Trash2 size={15} /></button>
          </div>
          <textarea className="textarea" style={{ minHeight: 64 }} placeholder="Answer" value={q.answer} onChange={e => setFaqs(faqs.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} />
        </div>
      ))}
      <button className="btn primary block" disabled={saving} onClick={() => save({ businessProfile: { services, faqs: faqs.filter(x => x.question.trim() && x.answer.trim()) } })}>Save</button>
    </div>
  )
}

function Products({ config }: { config: UserConfig }) {
  const { save, saving } = useSave()
  const p = profileOf(config)
  const [items, setItems] = useState<CatalogItem[]>(p.catalog || [])
  const set = (i: number, patch: Partial<CatalogItem>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  return (
    <div className="stack">
      <p className="small muted">Vexa reads stock and prices live on calls: “Yes, 8 in stock at ₹2,450 each — ₹7,350 for 3.” Keep this in sync with your shelves.</p>
      {items.map((it, i) => (
        <div key={i} className="card stack" style={{ marginTop: 0, gap: 8 }}>
          <div className="row">
            <input className="input" placeholder="Item name" value={it.name} onChange={e => set(i, { name: e.target.value })} aria-label="Item name" />
            <button className="btn ghost icon sm" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remove item"><Trash2 size={15} /></button>
          </div>
          <div className="row">
            <Field label="In stock"><input className="input" type="number" min={0} value={it.stock} onChange={e => set(i, { stock: Number(e.target.value) })} /></Field>
            <Field label={`Price (${p.currency || 'USD'})`}><input className="input" type="number" min={0} value={it.price} onChange={e => set(i, { price: Number(e.target.value) })} /></Field>
            <Field label="Per"><input className="input" placeholder="each" value={it.unit || ''} onChange={e => set(i, { unit: e.target.value })} /></Field>
          </div>
        </div>
      ))}
      <button className="btn block" onClick={() => setItems([...items, { name: '', stock: 0, price: 0 }])}><Plus size={16} /> Add item</button>
      <button className="btn primary block" disabled={saving} onClick={() => save({ businessProfile: { catalog: items.filter(x => x.name.trim()) } })}>Save</button>
    </div>
  )
}

function Hours({ config }: { config: UserConfig }) {
  const { save, saving } = useSave()
  const p = profileOf(config)
  const [hours, setHours] = useState<BusinessHours[]>(p.hours)
  const [tz, setTz] = useState(p.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [after, setAfter] = useState(p.afterHoursMessage)
  const [emer, setEmer] = useState(p.afterHoursEmergencyTransfer !== false)
  return (
    <div className="stack">
      <div className="card"><HoursEditor hours={hours} onChange={setHours} /></div>
      <Field label="Time zone"><input className="input" value={tz} onChange={e => setTz(e.target.value)} /></Field>
      <Field label="After-hours message" hint="Optional — Vexa still takes a full message."><textarea className="textarea" value={after} onChange={e => setAfter(e.target.value)} /></Field>
      <label className="card row between" style={{ marginTop: 0 }}>
        <div><h3>Emergencies ring me after hours</h3><p className="xs muted">Off: Vexa alerts you but doesn’t transfer.</p></div>
        <Toggle checked={emer} onChange={setEmer} label="After-hours emergency transfer" />
      </label>
      <button className="btn primary block" disabled={saving} onClick={() => save({ businessProfile: { hours, timezone: tz, afterHoursMessage: after, afterHoursEmergencyTransfer: emer } })}>Save</button>
    </div>
  )
}

function Voice({ config }: { config: UserConfig }) {
  const { save, saving } = useSave()
  const [voice, setVoice] = useState(config.aiSettings?.voice || 'shimmer')
  const [greeting, setGreeting] = useState(config.aiSettings?.greeting || '')
  const [tone, setTone] = useState(config.aiSettings?.tone || '')
  const [esc, setEsc] = useState((config.escalationKeywords || []).join(', '))
  const [language, setLanguage] = useState(config.aiSettings?.language || 'en')
  return (
    <div className="stack">
      <div className="choice-grid">
        {VOICES.map(v => <button key={v.id} className={`choice${voice === v.id ? ' active' : ''}`} onClick={() => setVoice(v.id)}>{v.label}<span className="sub">{v.hint}</span></button>)}
      </div>
      <Field label="Greeting" hint="Leave empty for the smart default (uses the caller’s name when Vexa knows them)."><input className="input" value={greeting} onChange={e => setGreeting(e.target.value)} /></Field>
      <Field label="Greeting language" hint="Vexa answers in this language, then switches the moment a caller speaks another one — Telugu, Hindi, Tamil, Malayalam, Marathi, Gujarati, Spanish or English. Transcripts always come in English too.">
        <select className="select" value={language} onChange={e => setLanguage(e.target.value)}>
          {Object.entries(LANG_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Tone"><input className="input" value={tone} onChange={e => setTone(e.target.value)} placeholder="warm, professional and concise" /></Field>
      <Field label="Emergency words" hint="Any of these switches the call to the Emergency flow instantly."><input className="input" value={esc} onChange={e => setEsc(e.target.value)} /></Field>
      <button className="btn primary block" disabled={saving} onClick={() => save({ aiSettings: { voice, greeting, tone, language }, escalationKeywords: esc.split(',').map(s => s.trim()).filter(Boolean) })}>Save</button>
    </div>
  )
}

function RecordingSettings({ config }: { config: UserConfig }) {
  const { save, saving } = useSave()
  const [enabled, setEnabled] = useState(config.recording?.enabled !== false)
  const [announce, setAnnounce] = useState(config.recording?.announce !== false)
  const [days, setDays] = useState(config.recording?.retentionDays ?? 90)
  return (
    <div className="stack">
      <p className="small muted">Phone calls are recorded in stereo — the caller on one side, Vexa on the other — and play back next to the transcript. Tap a line to jump to that moment.</p>
      <div className="card stack">
        <label className="row between"><span className="small">Record phone calls</span><Toggle checked={enabled} onChange={setEnabled} label="Record phone calls" /></label>
        <label className="row between">
          <span className="small">Tell callers “this call may be recorded”<br /><span className="xs muted">Required in many places — keep it on unless you’re sure.</span></span>
          <Toggle checked={announce} onChange={setAnnounce} label="Announce recording" />
        </label>
      </div>
      <Field label="Keep recordings for" hint="Audio is deleted automatically after this. Transcripts and summaries stay.">
        <select className="select" value={days} onChange={e => setDays(Number(e.target.value))}>
          {[7, 30, 90, 180, 365].map(d => <option key={d} value={d}>{d} days</option>)}
        </select>
      </Field>
      <button className="btn primary block" disabled={saving} onClick={() => save({ recording: { enabled, announce, retentionDays: days } })}>Save</button>
    </div>
  )
}

function Deliveries({ config }: { config: UserConfig }) {
  const { save, saving } = useSave()
  const [a, setA] = useState({ flat: '', building: '', street: '', city: '', pincode: '', landmark: '', societyNotes: '', securityNotes: '', ...(config.deliveryAddress || {}) })
  const f = (k: keyof typeof a) => (e: React.ChangeEvent<HTMLInputElement>) => setA({ ...a, [k]: e.target.value })
  return (
    <div className="stack">
      <p className="small muted">Couriers get these directions instantly. You only get pulled in when they need a code or signature.</p>
      <div className="row"><Field label="Apt / unit"><input className="input" value={a.flat} onChange={f('flat')} /></Field><Field label="Building"><input className="input" value={a.building} onChange={f('building')} /></Field></div>
      <Field label="Street"><input className="input" value={a.street} onChange={f('street')} /></Field>
      <div className="row"><Field label="City"><input className="input" value={a.city} onChange={f('city')} /></Field><Field label="ZIP"><input className="input" value={a.pincode} onChange={f('pincode')} /></Field></div>
      <Field label="Landmark"><input className="input" value={a.landmark} onChange={f('landmark')} /></Field>
      <Field label="Directions note" hint="e.g. Maps shows the wrong entrance — use the side gate"><input className="input" value={a.societyNotes} onChange={f('societyNotes')} /></Field>
      <Field label="Gate / security note"><input className="input" value={a.securityNotes} onChange={f('securityNotes')} /></Field>
      <button className="btn primary block" disabled={saving} onClick={() => save({ deliveryAddress: a })}>Save</button>
    </div>
  )
}

function toE164(input: string) {
  const t = input.trim()
  const d = t.replace(/\D/g, '')
  return t.startsWith('+') ? `+${d}` : d.length === 10 ? `+1${d}` : `+${d}`
}

function Contacts() {
  const { reloadConfig } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'callers'
  const [callers, setCallers] = useState<CallerProfile[] | null>(null)
  const [vips, setVips] = useState<VipContact[]>([])
  const [blocked, setBlocked] = useState<string[]>([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  useEffect(() => {
    Promise.all([
      api<{ callers: CallerProfile[] }>('/api/calls/callers'),
      api<{ vipContacts: VipContact[] }>('/api/users/vip-contacts'),
      api<{ blockedNumbers: string[] }>('/api/users/blocked-numbers'),
    ]).then(([c, v, b]) => { setCallers(c.callers); setVips(v.vipContacts); setBlocked(b.blockedNumbers) }).catch(() => setCallers([]))
  }, [])

  async function addVip(e: FormEvent) {
    e.preventDefault()
    const n = toE164(phone)
    if (!/^\+[1-9]\d{6,14}$/.test(n)) return toast('Enter a valid number')
    const r = await api<{ vipContacts: VipContact[] }>('/api/users/vip-contacts', { method: 'PUT', body: { vipContacts: [...vips, { name: name.trim() || n, phoneNumber: n }] } })
    setVips(r.vipContacts); setName(''); setPhone(''); reloadConfig(); toast('VIP added')
  }
  async function removeVip(n: string) {
    const r = await api<{ vipContacts: VipContact[] }>('/api/users/vip-contacts', { method: 'PUT', body: { vipContacts: vips.filter(v => v.phoneNumber !== n) } })
    setVips(r.vipContacts); reloadConfig()
  }
  async function block(e: FormEvent) {
    e.preventDefault()
    const n = toE164(phone)
    if (!/^\+[1-9]\d{6,14}$/.test(n)) return toast('Enter a valid number')
    try {
      const r = await api<{ blockedNumbers: string[] }>('/api/users/blocked-numbers', { method: 'POST', body: { phoneNumber: n } })
      setBlocked(r.blockedNumbers); setPhone(''); reloadConfig(); toast('Blocked')
    } catch (err) { toast(err instanceof Error ? err.message : 'Failed') }
  }
  async function unblock(n: string) {
    const r = await api<{ blockedNumbers: string[] }>(`/api/users/blocked-numbers/${encodeURIComponent(n)}`, { method: 'DELETE' })
    setBlocked(r.blockedNumbers); reloadConfig()
  }

  if (!callers) return <PageLoader />
  return (
    <>
      <div className="chips" style={{ marginBottom: 14 }}>
        {[['callers', `Callers · ${callers.length}`], ['vip', `VIPs · ${vips.length}`], ['blocked', `Blocked · ${blocked.length}`]].map(([k, l]) => (
          <button key={k} className={`chip${tab === k ? ' active' : ''}`} onClick={() => setParams({ tab: k })}>{l}</button>
        ))}
      </div>
      {tab === 'callers' && (callers.length === 0
        ? <Empty icon={<Users size={24} />} title="No callers yet">Vexa remembers everyone who calls — their name, what they usually want, and notes you leave for them.</Empty>
        : <div className="card tight">{callers.map(c => (
            <div key={c.phoneNumber} className="list-row" style={{ cursor: 'default' }}>
              <span className="avatar">{c.callerName && c.callerName !== 'Unknown' ? initials(c.callerName) : '#'}</span>
              <div className="grow">
                <div className="row between"><h3 className="truncate">{c.callerName !== 'Unknown' ? c.callerName : formatPhone(c.phoneNumber)}</h3><span className="xs muted">{relativeTime(c.lastCallAt)}</span></div>
                <p className="xs dim truncate">{c.contextSummary || formatPhone(c.phoneNumber)}</p>
                <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                  {c.alwaysTransfer && <span className="badge live">Always put through</span>}
                  {!!c.instructions?.length && <span className="badge accent">{c.instructions.length} note{c.instructions.length > 1 ? 's' : ''} waiting</span>}
                  {!!c.spamCount && <span className="badge danger">Spam ×{c.spamCount}</span>}
                </div>
              </div>
            </div>
          ))}</div>)}
      {tab === 'vip' && (
        <>
          <form className="stack" onSubmit={addVip} style={{ marginBottom: 14 }}>
            <input className="input" placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
            <div className="composer"><input className="input" placeholder="Phone number" value={phone} onChange={e => setPhone(e.target.value)} /><button className="btn icon round primary" aria-label="Add VIP"><Plus size={18} /></button></div>
          </form>
          {vips.length === 0 ? <Empty icon={<Star size={24} />} title="No VIPs yet">VIPs get a warm greeting by name and can ask to be put through.</Empty>
            : <div className="card tight">{vips.map(v => (
              <div key={v.phoneNumber} className="list-row" style={{ cursor: 'default' }}>
                <span className="avatar">{initials(v.name)}</span>
                <div className="grow"><h3>{v.name}</h3><p className="xs muted">{formatPhone(v.phoneNumber)}</p></div>
                <button className="btn ghost icon sm" onClick={() => removeVip(v.phoneNumber)} aria-label={`Remove ${v.name}`}><Trash2 size={15} /></button>
              </div>))}</div>}
        </>
      )}
      {tab === 'blocked' && (
        <>
          <form className="composer" onSubmit={block} style={{ marginBottom: 14 }}>
            <input className="input" placeholder="Number to block" value={phone} onChange={e => setPhone(e.target.value)} />
            <button className="btn icon round danger" aria-label="Block"><Ban size={18} /></button>
          </form>
          {blocked.length === 0 ? <Empty icon={<Ban size={24} />} title="Nothing blocked">Blocked numbers are rejected before Vexa answers — no AI minutes used.</Empty>
            : <div className="card tight">{blocked.map(n => (
              <div key={n} className="list-row" style={{ cursor: 'default' }}>
                <span className="avatar spam"><Ban size={16} /></span>
                <div className="grow"><h3>{formatPhone(n)}</h3></div>
                <button className="btn sm" onClick={() => unblock(n)}>Unblock</button>
              </div>))}</div>}
        </>
      )}
    </>
  )
}

const TITLES: Record<string, string> = { products: 'Products & stock', business: 'Business info', knowledge: 'Services & FAQs', hours: 'Opening hours', voice: 'Voice & language', recording: 'Recording & privacy', deliveries: 'Deliveries', contacts: 'People', phone: 'Phone setup' }

export default function SettingsPage() {
  const { section = '' } = useParams()
  const { config } = useAuth()
  if (!config) return <PageLoader />
  return (
    <>
      <TopBar title={TITLES[section] || 'Settings'} back="/me" />
      {section === 'business' && <Business config={config} />}
      {section === 'knowledge' && <Knowledge config={config} />}
      {section === 'products' && <Products config={config} />}
      {section === 'hours' && <Hours config={config} />}
      {section === 'voice' && <Voice config={config} />}
      {section === 'recording' && <RecordingSettings config={config} />}
      {section === 'deliveries' && <Deliveries config={config} />}
      {section === 'contacts' && <Contacts />}
      {section === 'phone' && <PhoneSetup />}
    </>
  )
}
