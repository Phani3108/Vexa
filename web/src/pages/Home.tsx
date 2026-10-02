import { useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { BellOff, CalendarCheck, ChevronRight, Database, MessageSquareText, Moon, PhoneCall, Shield, ShieldAlert, Sparkles } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useLive } from '../lib/live'
import type { Booking, Brief, UserConfig } from '../lib/types'
import { formatPhone, initials, relativeTime } from '../lib/format'
import Orb from '../components/Orb'
import Sheet from '../components/Sheet'
import { PageLoader, RiskBadge, toast } from '../components/ui'

const SHIELDS = [
  { mode: 'standard', label: 'Standard', icon: Shield },
  { mode: 'focus', label: 'Focus', icon: Moon },
  { mode: 'aggressive', label: 'Spam shield', icon: ShieldAlert },
  { mode: 'silent', label: 'Silent', icon: BellOff },
] as const

const SHIELD_HELP: Record<string, string> = {
  standard: 'Vexa screens calls and puts important ones through.',
  focus: 'Nobody gets through except emergencies. Everything else becomes a message.',
  aggressive: 'Unknown high-risk numbers get the one-line spam flow; the worst are rejected before ringing.',
  silent: 'Vexa handles everything without notifications. Check in when you’re ready.',
}

export default function Home() {
  const { config, meta, reloadConfig, setConfig } = useAuth()
  const navigate = useNavigate()
  const { calls: live, version } = useLive()
  const { openAsk } = useOutletContext<{ openAsk: () => void }>()
  const [brief, setBrief] = useState<Brief | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [focusSheet, setFocusSheet] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const isBiz = config?.accountType !== 'personal'

  async function load() {
    const [b, bk] = await Promise.all([
      api<Brief>('/api/assistant/brief'),
      isBiz ? api<{ bookings: Booking[] }>('/api/bookings?status=requested') : Promise.resolve({ bookings: [] }),
    ])
    setBrief(b)
    setBookings(bk.bookings)
  }
  useEffect(() => { load().catch(() => {}) }, [version, config?.shield?.mode, config?.shield?.until]) // eslint-disable-line react-hooks/exhaustive-deps

  async function setShield(mode: string, minutes?: number) {
    await api('/api/assistant/shield', { method: 'PUT', body: { mode, minutes } })
    setFocusSheet(false)
    toast(mode === 'standard' ? 'Standard mode' : `${SHIELDS.find(s => s.mode === mode)?.label} on${minutes ? ` for ${minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`}` : ''}`)
    await Promise.all([load(), reloadConfig()])
  }

  async function switchMode(mode: 'personal' | 'business') {
    if (config?.accountType === mode) return
    try {
      const { config: c } = await api<{ config: UserConfig }>('/api/users/mode', { method: 'POST', body: { accountType: mode } })
      setConfig(c)
      toast(mode === 'business' ? 'Business mode — receptionist flows on' : 'Personal mode — screening flows on')
    } catch (e) {
      if (e instanceof Error && /Set up your business/.test(e.message)) navigate('/onboarding?mode=business')
      else toast(e instanceof Error ? e.message : 'Could not switch')
    }
  }

  async function seed() {
    setSeeding(true)
    await api('/api/users/demo-data', { method: 'POST' }).finally(() => setSeeding(false))
    toast('Sample calls loaded')
    load()
  }

  if (!brief) return <PageLoader />

  const first = config?.name && config.name !== 'User' ? config.name.split(' ')[0] : ''
  const h = new Date().getHours()
  const greet = h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  const s = brief.stats

  return (
    <>
      <div className="row between" style={{ marginBottom: 18 }}>
        <div>
          <div className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</div>
          <h1 style={{ marginTop: 4 }}>{greet}{first ? `, ${first}` : ''}</h1>
          <div className="mode-pill" role="radiogroup" aria-label="Mode" style={{ marginTop: 10 }}>
            <button role="radio" aria-checked={!isBiz} className={!isBiz ? 'on' : ''} onClick={() => switchMode('personal')}>Personal</button>
            <button role="radio" aria-checked={isBiz} className={isBiz ? 'on' : ''} onClick={() => switchMode('business')}>Business</button>
          </div>
        </div>
        <Link to="/me" className="avatar" aria-label="Account">{initials(config?.businessProfile?.businessName || config?.name || 'V')}</Link>
      </div>

      {live.map(c => (
        <Link key={c.callId} to={`/live/${c.callId}`} className="card live" style={{ display: 'block', marginBottom: 12 }}>
          <div className="row between">
            <span className="badge live"><span className={`dot${c.status === 'live' ? ' pulse' : ''}`} />{c.status === 'live' ? 'On a call now' : 'Call ended'}</span>
            <RiskBadge score={c.risk?.score} />
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <Orb size={40} state={c.partial ? 'speaking' : 'idle'} />
            <div className="grow">
              <h3 className="truncate">{c.callerName !== 'Unknown' ? c.callerName : formatPhone(c.from)}</h3>
              <p className="small dim truncate">{c.workflow?.name || 'Screening'} · {c.partial || c.transcript.at(-1)?.text || 'Connecting…'}</p>
            </div>
            <ChevronRight size={18} className="muted" />
          </div>
          {c.progress != null && <div className="progress" style={{ width: '100%', marginTop: 10 }}><i style={{ width: `${Math.round(c.progress * 100)}%` }} /></div>}
        </Link>
      ))}

      <div className="shields" role="radiogroup" aria-label="Shield mode">
        {SHIELDS.map(sh => (
          <button key={sh.mode} role="radio" aria-checked={brief.shield === sh.mode} className={`shield${brief.shield === sh.mode ? ' on' : ''}`}
            onClick={() => (sh.mode === 'focus' ? setFocusSheet(true) : setShield(sh.mode))}>
            <span className="ico"><sh.icon size={18} /></span>{sh.label}
          </button>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        {SHIELD_HELP[brief.shield]}{brief.shieldUntil && brief.shield !== 'standard' ? ` Until ${new Date(brief.shieldUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : ''}
      </p>

      <div className="card glow section">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <Orb size={36} />
          <div className="grow">
            <div className="eyebrow">Your brief</div>
            <p style={{ marginTop: 4, fontWeight: 500 }}>{brief.text}</p>
          </div>
        </div>
        <div className="stat-grid" style={{ marginTop: 14 }}>
          <div className="stat"><div className="v">{s.calls}</div><div className="l">calls handled</div></div>
          <div className="stat"><div className="v" style={{ color: 'var(--live)' }}>{s.leads}</div><div className="l">{isBiz ? 'leads' : 'messages'}</div></div>
          <div className="stat"><div className="v">{s.minutesSaved}<span className="small"> m</span></div><div className="l">time saved</div></div>
        </div>
        {(s.spam > 0 || s.questionsSkipped > 0) && (
          <div className="row wrap small dim" style={{ marginTop: 10, gap: 6 }}>
            {s.spam > 0 && <span className="badge"><ShieldAlert size={11} /> {s.spam} spam blocked</span>}
            {s.questionsSkipped > 0 && <span className="badge accent"><Sparkles size={11} /> {s.questionsSkipped} questions skipped by understanding callers</span>}
          </div>
        )}
      </div>

      {brief.needsYou.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>Needs you</h2><Link to="/activity?f=needs">See all</Link></div>
          <div className="card tight">
            {brief.needsYou.map(n => (
              <Link key={n.callId} to={`/call/${n.callId}`} className="list-row">
                <div className="avatar lead">{n.name ? initials(n.name) : '#'}</div>
                <div className="grow">
                  <div className="row between"><h3 className="truncate">{n.name || formatPhone(n.from)}</h3><span className="xs muted">{relativeTime(n.at)}</span></div>
                  <p className="small dim truncate">{n.summary}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {isBiz && bookings.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>Booking requests</h2><Link to="/bookings">Review</Link></div>
          <Link to="/bookings" className="card row">
            <span className="avatar"><CalendarCheck size={18} /></span>
            <div className="grow">
              <h3>{bookings.length} waiting for approval</h3>
              <p className="small dim truncate">{bookings.slice(0, 2).map(b => `${b.customerName || 'Caller'} · ${b.requestedTime || 'time TBD'}`).join('  •  ')}</p>
            </div>
            <ChevronRight size={18} className="muted" />
          </Link>
        </div>
      )}

      <div className="section">
        <div className="section-head"><h2>Quick actions</h2></div>
        <div className="choice-grid">
          <Link to="/test" className="choice"><PhoneCall size={20} color="var(--live)" />Test call<span className="sub">Call your receptionist — type or talk</span></Link>
          <button className="choice" onClick={openAsk}><MessageSquareText size={20} color="var(--accent)" />Ask Vexa<span className="sub">“Tell Dana her parts arrived”</span></button>
        </div>
        {s.calls === 0 && meta?.demoDataEnabled && (
          <button className="btn block" style={{ marginTop: 12 }} onClick={seed} disabled={seeding}><Database size={16} /> {seeding ? 'Loading…' : 'Load sample calls'}</button>
        )}
      </div>

      <Sheet open={focusSheet} onClose={() => setFocusSheet(false)} label="Focus duration">
        <h2>Focus for…</h2>
        <p className="small muted" style={{ margin: '6px 0 16px' }}>Only emergencies and your emergency contacts break through.</p>
        <div className="stack">
          {[[30, '30 minutes'], [60, '1 hour'], [120, '2 hours'], [240, '4 hours']].map(([m, l]) => (
            <button key={m} className="btn block" onClick={() => setShield('focus', m as number)}>{l}</button>
          ))}
          <button className="btn block primary" onClick={() => setShield('focus')}>Until I turn it off</button>
        </div>
      </Sheet>
    </>
  )
}
