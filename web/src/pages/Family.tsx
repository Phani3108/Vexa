import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, HeartHandshake, ShieldCheck, UserMinus } from 'lucide-react'
import { api } from '../lib/api'
import type { FamilyOverview, FamilyShare } from '../lib/types'
import { formatPhone, initials } from '../lib/format'
import { Field, PageLoader, Toggle, TopBar, toast } from '../components/ui'

const SHARE_LABELS: [keyof FamilyShare, string, string][] = [
  ['scamAlerts', 'Scam and emergency alerts', 'Sent the moment Vexa blocks a scam or hears an emergency'],
  ['summaries', 'Call summaries', 'Who called and what Vexa did — plus an evening digest'],
  ['recordings', 'Full transcripts', 'Off by default; the words of every call'],
]

/** Family guardian: a parent lets their son or daughter watch over their calls (with consent), or you watch over theirs. */
export default function Family() {
  const [data, setData] = useState<FamilyOverview | null>(null)
  const [share, setShare] = useState<FamilyShare>({ summaries: true, scamAlerts: true, recordings: false })
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null)
  const [entry, setEntry] = useState('')

  const load = () => api<FamilyOverview>('/api/family').then(setData)
  useEffect(() => { load() }, [])

  async function invite() {
    try { setCode(await api<{ code: string; expiresAt: string }>('/api/family/invite', { method: 'POST', body: { share } })); load() } catch (e) { toast(e instanceof Error ? e.message : 'Could not create a code') }
  }
  async function accept() {
    try { setData(await api<FamilyOverview>('/api/family/accept', { method: 'POST', body: { code: entry } })); setEntry(''); toast('Linked — you will get their alerts') } catch (e) { toast(e instanceof Error ? e.message : 'Could not link') }
  }
  async function change(linkId: string, s: FamilyShare) {
    setData(await api<FamilyOverview>(`/api/family/${linkId}`, { method: 'PATCH', body: { share: s } }))
  }
  async function remove(linkId: string, who: string) {
    if (!confirm(`Remove the family link with ${who}?`)) return
    setData(await api<FamilyOverview>(`/api/family/${linkId}`, { method: 'DELETE' }))
    toast('Link removed')
  }

  if (!data) return <PageLoader />

  return (
    <>
      <TopBar title="Family" />
      <p className="small dim" style={{ marginBottom: 14 }}>Look after a parent's phone from yours: you hear about scam calls the moment Vexa blocks them, and you can read what their calls were about. They choose what you see, and you always ring through to them.</p>

      {data.dependants.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>You look after</h2></div>
          <div className="card tight">
            {data.dependants.map(d => (
              <Link key={d.linkId} to={`/family/${encodeURIComponent(d.userId)}`} className="list-row">
                <span className="avatar">{initials(d.name || '')}</span>
                <div className="grow"><h3>{d.name}</h3><p className="xs muted">{d.phoneNumber ? formatPhone(d.phoneNumber) : ''}{d.share.scamAlerts ? ' · scam alerts on' : ''}</p></div>
                <ChevronRight size={17} className="chev" />
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="section card stack" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 8 }}><HeartHandshake size={18} color="var(--accent)" /><h3>Look after someone's calls</h3></div>
        <p className="xs muted">Ask them to open Vexa → Me → Family → “Create a code”, then enter it here.</p>
        <div className="row" style={{ gap: 8 }}>
          <input className="input mono" inputMode="numeric" maxLength={6} placeholder="6-digit code" value={entry} onChange={e => setEntry(e.target.value.replace(/\D/g, ''))} aria-label="Family code" />
          <button className="btn primary" disabled={entry.length !== 6} onClick={accept}>Link</button>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>Who looks after my calls</h2></div>
        {data.guardians.map(g => (
          <div key={g.linkId} className="card stack" style={{ gap: 10 }}>
            <div className="row between">
              <div className="row" style={{ gap: 10 }}><span className="avatar">{initials(g.name || '')}</span><div><h3>{g.name}</h3><p className="xs muted">Always rings through to you</p></div></div>
              <button className="btn icon sm" onClick={() => remove(g.linkId, g.name || 'them')} aria-label="Remove link"><UserMinus size={16} /></button>
            </div>
            {SHARE_LABELS.map(([k, label]) => (
              <div key={k} className="row between"><span className="small">{label}</span><Toggle checked={g.share[k]} onChange={v => change(g.linkId, { ...g.share, [k]: v })} label={label} /></div>
            ))}
          </div>
        ))}

        <div className="card stack" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 8 }}><ShieldCheck size={18} color="var(--live)" /><h3>Let a family member see my calls</h3></div>
          {SHARE_LABELS.map(([k, label, hint]) => (
            <div key={k} className="row between">
              <div><div className="small">{label}</div><div className="xs muted">{hint}</div></div>
              <Toggle checked={share[k]} onChange={v => setShare(s => ({ ...s, [k]: v }))} label={label} />
            </div>
          ))}
          {code ? (
            <Field label="Give them this code" hint={`Valid until ${new Date(code.expiresAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}. Only share it with family.`}>
              <div className="mono" style={{ fontSize: 34, letterSpacing: 8, textAlign: 'center', padding: '8px 0' }}>{code.code}</div>
            </Field>
          ) : (
            <button className="btn primary" onClick={invite}>{data.pendingInvite ? 'Create a new code' : 'Create a code'}</button>
          )}
        </div>
      </div>
    </>
  )
}
