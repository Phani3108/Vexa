import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Inbox, PhoneIncoming, Search, X } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useLive } from '../lib/live'
import type { CallListItem } from '../lib/types'
import { callerLabel, formatDuration, relativeTime } from '../lib/format'
import { CallerAvatar, Empty, FollowUpBadge, Spinner } from '../components/ui'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'needs', label: 'Needs you' },
  { id: 'leads', label: 'Leads' },
  { id: 'bookings', label: 'Bookings', bizOnly: true },
  { id: 'spam', label: 'Spam' },
  { id: 'tests', label: 'Test calls' },
]

function dayLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const y = new Date(Date.now() - 86400000)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

export function CallRow({ c }: { c: CallListItem }) {
  return (
    <Link to={`/call/${c.callId}`} className="list-row">
      <CallerAvatar call={c} />
      <div className="grow">
        <div className="row between" style={{ gap: 8 }}>
          <h3 className="truncate">{callerLabel(c)}</h3>
          <span className="xs muted" style={{ flex: 'none' }}>{relativeTime(c.timestamp)}</span>
        </div>
        <p className="small dim truncate">{c.lead?.need || c.summary || 'No summary'}</p>
        <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
          {c.workflow && <span className="badge accent">{c.workflow.name}</span>}
          {c.isSpam && <span className="badge">Spam</span>}
          {c.workflow?.status === 'transferred' && <span className="badge live">Transferred</span>}
          <FollowUpBadge status={c.followUp} />
          {c.isTest && <span className="badge">Test</span>}
          <span className="xs muted mono">{formatDuration(c.duration)}</span>
        </div>
      </div>
    </Link>
  )
}

export default function ActivityPage() {
  const { config } = useAuth()
  const { version } = useLive()
  const [params, setParams] = useSearchParams()
  const filter = params.get('f') || 'all'
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [calls, setCalls] = useState<CallListItem[] | null>(null)

  useEffect(() => {
    const p = new URLSearchParams({ limit: '100' })
    if (filter === 'needs') p.set('followUp', 'open')
    if (filter === 'leads') p.set('leads', '1')
    if (filter === 'tests' || filter === 'all') p.set('includeTest', '1')
    if (q.trim()) p.set('q', q.trim())
    const t = setTimeout(() => {
      api<{ calls: CallListItem[] }>(`/api/calls?${p}`).then(r => {
        let list = r.calls
        if (filter === 'spam') list = list.filter(c => c.isSpam)
        if (filter === 'tests') list = list.filter(c => c.isTest)
        setCalls(list)
      }).catch(() => setCalls([]))
    }, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [filter, q, version])

  const groups = useMemo(() => {
    const out: { label: string; items: CallListItem[] }[] = []
    for (const c of calls || []) {
      const label = dayLabel(c.timestamp)
      const g = out.find(x => x.label === label)
      if (g) g.items.push(c)
      else out.push({ label, items: [c] })
    }
    return out
  }, [calls])

  return (
    <>
      <div className="row between" style={{ marginBottom: 14 }}>
        <h1>Activity</h1>
        <button className="back" onClick={() => { setSearching(s => !s); setQ('') }} aria-label={searching ? 'Close search' : 'Search'}>{searching ? <X size={18} /> : <Search size={18} />}</button>
      </div>
      {searching && <input className="input" style={{ marginBottom: 12 }} placeholder="Search names, numbers, summaries" value={q} onChange={e => setQ(e.target.value)} autoFocus aria-label="Search calls" />}

      <div className="chips" style={{ marginBottom: 14 }}>
        {FILTERS.filter(f => !f.bizOnly || config?.accountType !== 'personal').map(f => (
          f.id === 'bookings'
            ? <Link key={f.id} to="/bookings" className="chip">{f.label}</Link>
            : <button key={f.id} className={`chip${filter === f.id ? ' active' : ''}`} onClick={() => setParams(f.id === 'all' ? {} : { f: f.id })}>{f.label}</button>
        ))}
      </div>

      {!calls ? <div className="center"><Spinner /></div>
        : calls.length === 0 ? (
          filter === 'needs'
            ? <Empty icon={<Inbox size={24} />} title="All caught up">New leads and messages land here the moment a call ends.</Empty>
            : <Empty icon={<PhoneIncoming size={24} />} title="Nothing here yet" action={<Link to="/test" className="btn primary sm">Make a test call</Link>}>Calls Vexa answers show up here with a summary, what it captured, and the transcript.</Empty>
        ) : groups.map(g => (
          <div key={g.label} style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ margin: '0 4px 8px' }}>{g.label}</div>
            <div className="card tight">{g.items.map(c => <CallRow key={c.callId} c={c} />)}</div>
          </div>
        ))}
    </>
  )
}
