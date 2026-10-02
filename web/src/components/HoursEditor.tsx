import type { BusinessHours } from '../lib/types'
import { DAY_NAMES } from '../lib/format'
import { Toggle } from './ui'

// Monday-first display order
const ORDER = [1, 2, 3, 4, 5, 6, 0]

export default function HoursEditor({ hours, onChange }: { hours: BusinessHours[]; onChange: (h: BusinessHours[]) => void }) {
  const byDay = (day: number) => hours.find(h => h.day === day) || { day, open: '09:00', close: '17:00', closed: true }
  const update = (day: number, patch: Partial<BusinessHours>) => {
    const next = ORDER.map(d => (d === day ? { ...byDay(d), ...patch } : byDay(d)))
    onChange(next)
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      {ORDER.map(day => {
        const h = byDay(day)
        return (
          <div key={day} className="hours-row">
            <span style={{ fontWeight: 500 }}>{DAY_NAMES[day]}</span>
            <span className="row" style={{ gap: 8 }}>
              <Toggle checked={!h.closed} onChange={v => update(day, { closed: !v })} label={`Open on ${DAY_NAMES[day]}`} />
              <span className="muted small" style={{ width: 44 }}>{h.closed ? 'Closed' : 'Open'}</span>
            </span>
            {!h.closed ? (
              <>
                <input className="input" type="time" value={h.open} onChange={e => update(day, { open: e.target.value })} aria-label={`${DAY_NAMES[day]} opening time`} />
                <input className="input" type="time" value={h.close} onChange={e => update(day, { close: e.target.value })} aria-label={`${DAY_NAMES[day]} closing time`} />
              </>
            ) : <span style={{ gridColumn: 'span 2' }} />}
          </div>
        )
      })}
    </div>
  )
}
