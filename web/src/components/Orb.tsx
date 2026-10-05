import type { ReactNode } from 'react'

/** Vexa's presence: breathes when idle, swirls fast when thinking, glows teal when speaking. */
export default function Orb({ size = 64, state = 'idle', children }: { size?: number; state?: 'idle' | 'thinking' | 'speaking'; children?: ReactNode }) {
  return (
    <div className={`orb ${state === 'idle' ? '' : state}`} style={{ width: size, height: size }} aria-hidden={!children}>
      <span className="orb-glow" />
      {children && <span className="orb-icon">{children}</span>}
    </div>
  )
}
