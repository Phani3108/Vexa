export function formatPhone(raw?: string | null): string {
  if (!raw) return 'Unknown number'
  const d = raw.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  return raw
}

export function relativeTime(iso?: string): string {
  if (!iso) return ''
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatDuration(sec?: number): string {
  if (!sec) return '0s'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`
}

export function callerLabel(c: { callerName?: string | null; from?: string; lead?: { name?: string | null } | null }): string {
  return c.callerName || c.lead?.name || formatPhone(c.from)
}

export function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z ]/g, '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '#'
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase()
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const ACTION_LABELS: Record<string, string> = {
  take_message: 'Take a message',
  follow_instructions: 'Follow my instructions',
  ask_purpose: 'Ask what it’s about',
  connect_user: 'Transfer to me',
  end_call: 'Politely end the call',
}

export const VOICES = [
  { id: 'shimmer', label: 'Shimmer', hint: 'Warm, clear' },
  { id: 'coral', label: 'Coral', hint: 'Friendly, upbeat' },
  { id: 'sage', label: 'Sage', hint: 'Calm, measured' },
  { id: 'alloy', label: 'Alloy', hint: 'Neutral' },
  { id: 'ash', label: 'Ash', hint: 'Confident' },
  { id: 'ballad', label: 'Ballad', hint: 'Soft' },
  { id: 'echo', label: 'Echo', hint: 'Deep' },
  { id: 'verse', label: 'Verse', hint: 'Expressive' },
]
