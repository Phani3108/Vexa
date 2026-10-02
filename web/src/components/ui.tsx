import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ChevronLeft, ShieldBan, Sparkles, UserRound } from 'lucide-react'
import type { CallListItem } from '../lib/types'
import { initials } from '../lib/format'

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />
}

export function PageLoader() {
  return <div className="center"><Spinner /></div>
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle" onClick={e => e.stopPropagation()}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} aria-label={label} />
      <span />
    </label>
  )
}

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ico">{icon}</div>
      <h3>{title}</h3>
      {children && <p className="small" style={{ maxWidth: 300 }}>{children}</p>}
      {action}
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

export function TopBar({ title, right, back = true }: { title?: string; right?: ReactNode; back?: boolean | string }) {
  const navigate = useNavigate()
  return (
    <div className="topbar">
      {back ? (
        <button className="back" aria-label="Back" onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}><ChevronLeft size={20} /></button>
      ) : <span style={{ width: 40 }} />}
      <div className="title truncate">{title}</div>
      <div style={{ minWidth: 40, display: 'flex', justifyContent: 'flex-end' }}>{right}</div>
    </div>
  )
}

export function CallerAvatar({ call, size }: { call: Pick<CallListItem, 'callerName' | 'isSpam' | 'urgency' | 'lead'>; size?: 'lg' }) {
  const cls = `avatar${size ? ` ${size}` : ''}`
  if (call.isSpam) return <div className={`${cls} spam`} aria-hidden><ShieldBan size={size ? 28 : 18} /></div>
  if (call.urgency === 'high' || call.urgency === 'critical') return <div className={`${cls} urgent`} aria-hidden><AlertTriangle size={size ? 28 : 18} /></div>
  const name = call.callerName || call.lead?.name
  return <div className={`${cls}${call.lead?.isLead ? ' lead' : ''}`} aria-hidden>{name ? initials(name) : <UserRound size={size ? 28 : 18} />}</div>
}

export function RiskBadge({ score }: { score?: number | null }) {
  if (score == null) return null
  const cls = score >= 60 ? 'danger' : score >= 30 ? 'warn' : 'ok'
  return <span className={`badge ${cls}`} title="Spam risk score"><ShieldBan size={11} /> {score}</span>
}

export function FollowUpBadge({ status }: { status: string }) {
  if (status === 'new') return <span className="badge warn"><span className="dot" />Needs you</span>
  if (status === 'in_progress') return <span className="badge accent">In progress</span>
  if (status === 'done') return <span className="badge ok">Done</span>
  return null
}

export function AiBadge() {
  return <span className="badge accent"><Sparkles size={11} /> AI</span>
}

let toastSetter: ((m: string | null) => void) | null = null

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    toastSetter = setMsg
    return () => { toastSetter = null }
  }, [])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 2600)
    return () => clearTimeout(t)
  }, [msg])
  return msg ? <div className="toast" role="status">{msg}</div> : null
}

// eslint-disable-next-line react-refresh/only-export-components
export function toast(message: string) {
  toastSetter?.(message)
}

/** Small async-state helper */
// eslint-disable-next-line react-refresh/only-export-components
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)
  const reload = useCallback(async () => {
    setError(null)
    try {
      setData(await run())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [run])
  useEffect(() => { reload() }, [reload])
  return { data, setData, loading, error, reload }
}
