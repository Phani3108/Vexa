import { useEffect, useState } from 'react'
import { Gauge } from 'lucide-react'
import { api } from '../lib/api'
import { Field, PageLoader, TopBar, toast } from '../components/ui'

interface Usage {
  today: { day: string; costUsd: number; requests: number; conversations: number; byPurpose: Record<string, number> }
  budgetUsd: number; maxBudgetUsd: number; overBudget: boolean; killSwitch: boolean
  days: { day: string; costUsd: number; requests: number; conversations: number }[]
}

const PURPOSE: Record<string, string> = { phone: 'Phone calls', test: 'Test calls', link: 'Vexa Link', agent: 'Agent API', interpreter: 'Interpreter', memory: 'Questions about calls', 'ask-vexa': 'Ask Vexa commands' }
const usd = (n: number) => `$${n < 1 ? n.toFixed(3) : n.toFixed(2)}`

/** What the AI cost today, against the daily budget the owner sets. */
export default function UsagePage() {
  const [u, setU] = useState<Usage | null>(null)
  const [budget, setBudget] = useState('')
  const apply = (r: Usage) => { setU(r); setBudget(String(r.budgetUsd)) }
  useEffect(() => { api<Usage>('/api/usage').then(apply) }, [])

  async function save() {
    try { apply(await api<Usage>('/api/usage/budget', { method: 'PUT', body: { dailyAiUsd: Number(budget) } })); toast('Daily limit saved') } catch (e) { toast(e instanceof Error ? e.message : 'Could not save') }
  }

  if (!u) return <PageLoader />
  const pct = Math.min(100, Math.round((u.today.costUsd / u.budgetUsd) * 100))
  return (
    <>
      <TopBar title="AI usage" />
      <div className="card stack" style={{ gap: 10 }}>
        <div className="row between"><div className="row" style={{ gap: 8 }}><Gauge size={18} color="var(--accent)" /><h3>Today</h3></div><span className="mono">{usd(u.today.costUsd)} of {usd(u.budgetUsd)}</span></div>
        <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden' }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Share of today's AI budget used">
          <div style={{ width: `${pct}%`, height: '100%', background: u.overBudget ? 'var(--danger)' : 'var(--accent)' }} />
        </div>
        <p className="xs muted">{u.today.conversations} conversations · {u.today.requests} AI requests{u.overBudget ? ' · limit reached: Vexa is answering on its offline rules until midnight UTC' : ''}{u.killSwitch ? ' · AI switched off on this server' : ''}</p>
        {Object.entries(u.today.byPurpose).map(([k, v]) => <div key={k} className="row between small"><span>{PURPOSE[k] || k}</span><span className="mono">{usd(v)}</span></div>)}
      </div>

      <div className="section">
        <Field label="Daily limit (USD)" hint={`Over the limit, flows keep working on offline rules — calls are never dropped. Up to $${u.maxBudgetUsd}.`}>
          <div className="row" style={{ gap: 8 }}>
            <input className="input" inputMode="decimal" value={budget} onChange={e => setBudget(e.target.value.replace(/[^\d.]/g, ''))} aria-label="Daily AI limit in US dollars" />
            <button className="btn sm" disabled={!budget || Number(budget) === u.budgetUsd} onClick={save}>Save</button>
          </div>
        </Field>
      </div>

      {u.days.length > 1 && (
        <div className="section">
          <div className="section-head"><h2>Last 7 days</h2></div>
          <div className="card tight">
            {u.days.map(d => <div key={d.day} className="list-row"><div className="grow small">{new Date(`${d.day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</div><span className="xs muted">{d.conversations} conv.</span><span className="mono small" style={{ marginLeft: 12 }}>{usd(d.costUsd)}</span></div>)}
          </div>
        </div>
      )}
    </>
  )
}
