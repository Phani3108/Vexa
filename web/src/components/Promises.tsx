import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Clock, IndianRupee, StickyNote, X } from 'lucide-react'
import { api } from '../lib/api'
import type { Memory } from '../lib/types'
import { dueTime, relativeTime } from '../lib/format'
import { toast } from './ui'

const ICON = { promise: Clock, quote: IndianRupee, fact: StickyNote }

/** Promises callers made, prices they quoted and facts worth keeping — saved from calls. */
export default function Promises({ version }: { version: number }) {
  const [items, setItems] = useState<Memory[]>([])
  useEffect(() => { api<{ memories: Memory[] }>('/api/memory').then(r => setItems(r.memories)).catch(() => {}) }, [version])

  async function mark(m: Memory, status: 'done' | 'dismissed') {
    await api(`/api/memory/${m._id}`, { method: 'PATCH', body: { status } }).catch(e => toast(e.message))
    setItems(list => list.filter(x => x._id !== m._id))
  }

  if (!items.length) return null
  return (
    <div className="section">
      <div className="section-head"><h2>Promises & quotes</h2><span className="xs muted">Ask Vexa: “What did the electrician quote?”</span></div>
      <div className="card tight">
        {items.slice(0, 6).map(m => {
          const Icon = ICON[m.kind]
          const overdue = m.dueAt && new Date(m.dueAt) < new Date()
          return (
            <div key={m._id} className="list-row">
              <span className="avatar" style={{ width: 34, height: 34, borderRadius: 10 }}><Icon size={16} /></span>
              <div className="grow">
                <p className="small">{m.text}</p>
                <p className="xs muted">
                  {m.who ? `${m.who} · ` : ''}
                  {m.dueAt ? <span style={overdue ? { color: 'var(--danger)' } : undefined}>{overdue ? 'was due ' : 'due '}{dueTime(m.dueAt)}</span> : relativeTime(m.createdAt)}
                  {m.callId && <> · <Link to={`/call/${encodeURIComponent(m.callId)}`}>call</Link></>}
                  {m.isTest ? ' · test call' : ''}
                </p>
              </div>
              {m.kind === 'promise' && <button className="btn icon sm" onClick={() => mark(m, 'done')} aria-label="Mark done"><Check size={15} /></button>}
              <button className="btn icon sm" onClick={() => mark(m, 'dismissed')} aria-label="Dismiss"><X size={15} /></button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
