import { useEffect, useState } from 'react'
import { Bot, Copy } from 'lucide-react'
import { api } from '../lib/api'
import { Field, PageLoader, Toggle, TopBar, toast } from '../components/ui'

interface Settings { enabled: boolean; slug: string | null; dailyLimit: number; usedToday: number; tools: { name: string; description: string }[] }

/** Callable agent API: other people's AI assistants can ask questions, book and order — as requests you approve. */
export default function AgentApi() {
  const [s, setS] = useState<Settings | null>(null)
  const [limit, setLimit] = useState('100')
  const apply = (r: Settings) => { setS(r); setLimit(String(r.dailyLimit)) }
  useEffect(() => { api<Settings>('/api/agent-settings').then(apply) }, [])

  async function save(body: Partial<{ enabled: boolean; dailyLimit: number }>) {
    try { apply(await api<Settings>('/api/agent-settings', { method: 'PUT', body })); toast('Saved') } catch (e) { toast(e instanceof Error ? e.message : 'Could not save') }
  }

  if (!s) return <PageLoader />
  const endpoint = s.slug ? `${location.origin}/api/agent/v1/${s.slug}` : null
  const example = endpoint ? `curl -X POST ${endpoint}/call \\\n  -H 'content-type: application/json' \\\n  -d '{"tool":"search_catalog","arguments":{"query":"LED bulb"},"agent":{"name":"My assistant"}}'` : ''

  return (
    <>
      <TopBar title="Agent API" />
      <p className="small dim" style={{ marginBottom: 14 }}>More and more customers will send their own AI assistant instead of calling. Turn this on and those assistants can ask about your business, check prices and stock, and send booking or order requests — in exact, structured form. Everything they send lands in your inbox for approval, like a call.</p>

      <div className="card row between">
        <div><div>Agent API is {s.enabled ? 'on' : 'off'}</div><div className="xs muted">{s.usedToday} of {s.dailyLimit} requests today</div></div>
        <Toggle checked={s.enabled} onChange={v => save({ enabled: v })} label="Agent API on" />
      </div>

      {s.enabled && endpoint && (
        <div className="card stack" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 8 }}><Bot size={18} color="var(--accent)" /><h3>Your endpoint</h3></div>
          <p className="mono xs" style={{ wordBreak: 'break-all' }}>{endpoint}</p>
          <pre className="mono xs" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'var(--surface-2)', padding: 10, borderRadius: 10 }}>{example}</pre>
          <button className="btn sm" onClick={() => navigator.clipboard.writeText(endpoint).then(() => toast('Endpoint copied'))}><Copy size={14} /> Copy endpoint</button>
        </div>
      )}

      <div className="section">
        <div className="section-head"><h2>What agents can do</h2></div>
        <div className="card tight">
          {s.tools.map(t => <div key={t.name} className="list-row"><div className="grow"><h3 className="mono small">{t.name}</h3><p className="xs muted">{t.description}</p></div></div>)}
        </div>
        <p className="xs muted" style={{ marginTop: 8 }}>Agents never see customer records, and nothing is confirmed without you.</p>
      </div>

      <Field label="Bookings and orders per day" hint="Keeps runaway agents in check">
        <div className="row" style={{ gap: 8 }}>
          <input className="input" inputMode="numeric" value={limit} onChange={e => setLimit(e.target.value.replace(/\D/g, ''))} aria-label="Requests per day" />
          <button className="btn sm" disabled={!limit || Number(limit) === s.dailyLimit} onClick={() => save({ dailyLimit: Number(limit) })}>Save</button>
        </div>
      </Field>
    </>
  )
}
