import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, Check, X } from 'lucide-react'
import { api } from '../lib/api'
import { useLive } from '../lib/live'
import type { Booking } from '../lib/types'
import { formatPhone, relativeTime } from '../lib/format'
import { Empty, PageLoader, TopBar, toast } from '../components/ui'

export default function Bookings() {
  const { version } = useLive()
  const [list, setList] = useState<Booking[] | null>(null)
  const [times, setTimes] = useState<Record<string, string>>({})

  useEffect(() => { api<{ bookings: Booking[] }>('/api/bookings').then(r => setList(r.bookings)).catch(() => setList([])) }, [version])

  async function decide(b: Booking, status: 'confirmed' | 'declined') {
    const r = await api<{ booking: Booking; sms: { status: string } | null }>(`/api/bookings/${b._id}`, { method: 'PATCH', body: { status, confirmedTime: times[b._id] || b.requestedTime } })
    setList(l => l!.map(x => (x._id === b._id ? r.booking : x)))
    toast(`${status === 'confirmed' ? 'Confirmed' : 'Declined'}${r.sms ? ` · text ${r.sms.status}` : ''}`)
  }

  if (!list) return <PageLoader />
  const pending = list.filter(b => b.status === 'requested')
  const rest = list.filter(b => b.status !== 'requested')

  return (
    <>
      <TopBar title="Bookings" />
      <p className="small dim" style={{ marginBottom: 14 }}>Vexa never promises a slot on its own. Approve here and the caller gets a confirmation text.</p>
      {list.length === 0 && <Empty icon={<CalendarCheck size={24} />} title="No booking requests yet">When callers ask for an appointment, the request lands here for one-tap approval.</Empty>}

      {pending.map(b => (
        <div key={b._id} className="card glow stack" style={{ gap: 10 }}>
          <div className="row between">
            <div className="grow">
              <h3>{b.customerName || formatPhone(b.phoneNumber)}</h3>
              <p className="small dim">{b.service || 'Appointment'}{b.kind !== 'new' ? ` · ${b.kind}` : ''}</p>
            </div>
            <span className="xs muted">{relativeTime(b.createdAt)}</span>
          </div>
          <div className="row">
            <span className="badge warn">Asked for</span>
            <input className="input" style={{ height: 40 }} value={times[b._id] ?? b.requestedTime ?? ''} onChange={e => setTimes(t => ({ ...t, [b._id]: e.target.value }))} aria-label="Confirmed time" />
          </div>
          <div className="row">
            <button className="btn grow danger" onClick={() => decide(b, 'declined')}><X size={16} /> Decline</button>
            <button className="btn grow primary" onClick={() => decide(b, 'confirmed')}><Check size={16} /> Confirm & text</button>
          </div>
          {b.callId && <Link to={`/call/${b.callId}`} className="link xs">View call</Link>}
        </div>
      ))}

      {rest.length > 0 && (
        <div className="section">
          <div className="eyebrow" style={{ margin: '0 4px 8px' }}>Handled</div>
          <div className="card tight">
            {rest.map(b => (
              <div key={b._id} className="list-row" style={{ cursor: 'default' }}>
                <span className={`avatar ${b.status === 'confirmed' ? 'lead' : 'spam'}`}>{b.status === 'confirmed' ? <Check size={16} /> : <X size={16} />}</span>
                <div className="grow"><h3 className="truncate">{b.customerName || formatPhone(b.phoneNumber)}</h3><p className="xs muted truncate">{b.service} · {b.confirmedTime || b.requestedTime}</p></div>
                <span className={`badge ${b.status === 'confirmed' ? 'ok' : ''}`}>{b.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
