import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, RotateCcw, Sparkles } from 'lucide-react'
import { api } from '../lib/api'
import type { FlowStats, Workflow } from '../lib/types'
import { FlowIcon } from '../components/flowIcons'
import Sheet from '../components/Sheet'
import { PageLoader, Toggle, toast } from '../components/ui'

export default function Flows() {
  const navigate = useNavigate()
  const [flows, setFlows] = useState<Workflow[] | null>(null)
  const [stats, setStats] = useState<Record<string, FlowStats>>({})
  const [reset, setReset] = useState(false)

  const load = () => api<{ workflows: Workflow[]; stats: Record<string, FlowStats> }>('/api/workflows').then(r => { setFlows(r.workflows); setStats(r.stats) })
  useEffect(() => { load() }, [])

  async function toggle(f: Workflow, enabled: boolean) {
    try {
      await api(`/api/workflows/${f.id}`, { method: 'PATCH', body: { enabled } })
      setFlows(fs => fs!.map(x => (x.id === f.id ? { ...x, enabled } : x)))
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update')
    }
  }

  async function create() {
    const r = await api<{ workflow: Workflow }>('/api/workflows', { method: 'POST', body: { name: 'New flow' } })
    navigate(`/flows/${r.workflow.id}`)
  }

  async function doReset() {
    await api('/api/workflows/reset', { method: 'POST' })
    setReset(false)
    toast('Default flows restored')
    load()
  }

  if (!flows) return <PageLoader />

  const all = Object.values(stats)
  const runs = all.reduce((s, x) => s + x.runs, 0)
  const avgQ = runs ? all.reduce((s, x) => s + x.avgQuestions * x.runs, 0) / runs : 0
  const skipped = all.reduce((s, x) => s + x.questionsSkipped, 0)
  const sorted = flows.slice().sort((a, b) => a.priority - b.priority)

  return (
    <>
      <div className="row between" style={{ marginBottom: 6 }}>
        <h1>Flows</h1>
        <button className="back" onClick={create} aria-label="New flow"><Plus size={20} /></button>
      </div>
      <p className="dim small" style={{ marginBottom: 16 }}>Step-by-step playbooks Vexa follows on every call. It picks the right one from what the caller says, and switches mid-call if something urgent comes up.</p>

      <div className="card glow">
        <div className="row"><Sparkles size={16} color="var(--accent)" /><span className="eyebrow">Last 30 days</span></div>
        <div className="stat-grid" style={{ marginTop: 10 }}>
          <div className="stat"><div className="v">{runs}</div><div className="l">conversations</div></div>
          <div className="stat"><div className="v">{avgQ.toFixed(1)}</div><div className="l">questions / call</div></div>
          <div className="stat"><div className="v" style={{ color: 'var(--live)' }}>{skipped}</div><div className="l">questions skipped</div></div>
        </div>
        <p className="xs muted" style={{ marginTop: 10 }}>“Skipped” means the caller already answered before being asked, or Vexa remembered them. Fewer questions means shorter, cheaper calls.</p>
      </div>

      <div className="section stack" style={{ gap: 10 }}>
        {sorted.map(f => {
          const st = stats[f.id]
          return (
            <div key={f.id} className="card row" style={{ opacity: f.enabled ? 1 : 0.55, marginTop: 0 }}>
              <Link to={`/flows/${f.id}`} className="row grow">
                <span className="avatar" style={{ borderRadius: 14 }}><FlowIcon name={f.icon} /></span>
                <div className="grow">
                  <div className="row" style={{ gap: 6 }}>
                    <h3 className="truncate">{f.name}</h3>
                    {f.trigger?.isDefault && <span className="badge">Fallback</span>}
                  </div>
                  <p className="xs muted truncate">{f.description || `${f.steps.length} steps`}</p>
                  <p className="xs dim" style={{ marginTop: 3 }}>
                    {f.slots.length} question{f.slots.length === 1 ? '' : 's'} max
                    {st ? ` · ${st.runs} run${st.runs === 1 ? '' : 's'} · ${st.avgQuestions} asked avg` : ''}
                  </p>
                </div>
              </Link>
              <Toggle checked={f.enabled} onChange={v => toggle(f, v)} label={`Enable ${f.name}`} />
            </div>
          )
        })}
      </div>

      <button className="btn block ghost section" onClick={() => setReset(true)}><RotateCcw size={16} /> Restore default flows</button>

      <Sheet open={reset} onClose={() => setReset(false)} label="Restore defaults">
        <h2>Restore default flows?</h2>
        <p className="small muted" style={{ margin: '8px 0 16px' }}>This replaces all flows, including your edits and custom flows.</p>
        <button className="btn block danger" onClick={doReset}>Restore defaults</button>
      </Sheet>
    </>
  )
}
