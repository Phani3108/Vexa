import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Check, GraduationCap, Scissors, ShieldCheck, Stethoscope, Store, Utensils, Wrench, type LucideIcon } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { PackSummary } from '../lib/types'
import Sheet from '../components/Sheet'
import { PageLoader, Toggle, TopBar, toast } from '../components/ui'

const ICONS: Record<string, LucideIcon> = { stethoscope: Stethoscope, scissors: Scissors, utensils: Utensils, store: Store, wrench: Wrench, 'graduation-cap': GraduationCap, building: Building2 }

export default function Packs() {
  const navigate = useNavigate()
  const { reloadConfig } = useAuth()
  const [packs, setPacks] = useState<PackSummary[] | null>(null)
  const [installed, setInstalled] = useState<string[]>([])
  const [picked, setPicked] = useState<PackSummary | null>(null)
  const [sample, setSample] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => { api<{ packs: PackSummary[]; installed: string[] }>('/api/packs').then(r => { setPacks(r.packs); setInstalled(r.installed) }) }, [])

  async function install() {
    if (!picked) return
    setBusy(true)
    try {
      const r = await api<{ installed: string[] }>(`/api/packs/${picked.id}/install`, { method: 'POST', body: { sampleData: sample } })
      setInstalled(r.installed)
      await reloadConfig()
      toast(`${picked.name} installed — try a test call`)
      setPicked(null)
      navigate('/flows')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not install')
    } finally {
      setBusy(false)
    }
  }

  if (!packs) return <PageLoader />

  return (
    <>
      <TopBar title="Business packs" />
      <p className="small dim" style={{ marginBottom: 14 }}>A ready-made receptionist for your kind of business: its flows, the rules it must follow, and a test set it passes. Installing one switches you to Business mode and replaces your current flows.</p>
      <div className="stack" style={{ gap: 10 }}>
        {packs.map(p => {
          const Icon = ICONS[p.icon] || Store
          const on = installed.includes(p.id)
          return (
            <button key={p.id} className="card row" style={{ marginTop: 0, textAlign: 'left', alignItems: 'flex-start' }} onClick={() => setPicked(p)}>
              <Icon size={22} color="var(--accent)" style={{ flex: 'none', marginTop: 2 }} />
              <div className="grow stack" style={{ gap: 4 }}>
                <div className="row between"><h3>{p.name}</h3>{on && <span className="badge live"><Check size={12} /> Installed</span>}</div>
                <p className="small dim">{p.description}</p>
                <p className="xs muted">{p.flows.join(' · ')}</p>
              </div>
            </button>
          )
        })}
      </div>

      <Sheet open={!!picked} onClose={() => setPicked(null)} label={picked?.name || 'Pack'}>
        {picked && (
          <div className="stack" style={{ gap: 12 }}>
            <h2>{picked.name}</h2>
            <p className="small dim">{picked.description}</p>
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Flows</div>
              <p className="small">{picked.flows.join(' · ')}</p>
            </div>
            {picked.guardrails.length > 0 && (
              <div>
                <div className="eyebrow row" style={{ marginBottom: 6, gap: 6 }}><ShieldCheck size={14} /> Vexa will refuse</div>
                {picked.guardrails.map(g => <p key={g} className="small">{g}</p>)}
              </div>
            )}
            <div className="row between">
              <div>
                <div>Load a sample business</div>
                <div className="xs muted">Name, prices, hours and records to try it at once. Replaces your business details.</div>
              </div>
              <Toggle checked={sample} onChange={setSample} label="Load sample business" />
            </div>
            <button className="btn primary" disabled={busy} onClick={install}>{installed.includes(picked.id) ? 'Reinstall' : 'Install'} {picked.name}</button>
          </div>
        )}
      </Sheet>
    </>
  )
}
