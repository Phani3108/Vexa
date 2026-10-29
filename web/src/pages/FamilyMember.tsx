import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ShieldAlert, Siren } from 'lucide-react'
import { api } from '../lib/api'
import type { FamilyCall, FamilyShare } from '../lib/types'
import { relativeTime } from '../lib/format'
import { Empty, PageLoader, TopBar } from '../components/ui'

/** A guardian's view of a family member's calls: only what they chose to share. */
export default function FamilyMember() {
  const { userId = '' } = useParams()
  const [data, setData] = useState<{ calls: FamilyCall[]; share: FamilyShare } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { api<{ calls: FamilyCall[]; share: FamilyShare }>(`/api/family/dependants/${encodeURIComponent(userId)}/calls`).then(setData).catch(e => setError(e.message)) }, [userId])

  if (error) return <><TopBar title="Family" /><p className="dim">{error}</p></>
  if (!data) return <PageLoader />
  return (
    <>
      <TopBar title="Their calls" />
      {!data.share.summaries && <p className="small dim" style={{ marginBottom: 12 }}>They share scam and emergency alerts only.</p>}
      {data.calls.length === 0 && <Empty icon={<ShieldAlert size={24} />} title="Nothing yet">Calls Vexa handles for them will appear here.</Empty>}
      <div className="stack" style={{ gap: 10 }}>
        {data.calls.map(c => (
          <div key={c.callId} className={`card stack${c.scam ? ' scam-card' : ''}`} style={{ gap: 6, marginTop: 0 }}>
            <div className="row between">
              <h3 className="row" style={{ gap: 6 }}>{c.scam ? <ShieldAlert size={16} color="var(--danger)" /> : c.urgent ? <Siren size={16} color="var(--danger)" /> : null}{c.scam ? `Scam blocked: ${c.scam.label}` : c.from}</h3>
              <span className="xs muted">{relativeTime(c.at)}</span>
            </div>
            <p className="small">{c.summary}</p>
            {c.scam?.phrases?.[0] && <p className="xs muted">“{c.scam.phrases[0]}”</p>}
            {c.transcript && (
              <details><summary className="xs muted">Transcript</summary>{c.transcript.map((t, i) => <p key={i} className="xs"><b>{t.speaker === 'caller' ? 'Caller' : 'Vexa'}:</b> {t.text}</p>)}</details>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
