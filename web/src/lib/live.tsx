/**
 * Live calls over Socket.io (authenticated with the access token).
 * Tracks each call's transcript and the flow engine's live understanding.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from './auth'
import type { Handoff, Risk, TranscriptLine } from './types'

export interface LiveCall {
  callId: string
  from: string
  callerName: string
  startedAt: string
  isVIP: boolean
  transcript: TranscriptLine[]
  partial: string
  status: 'live' | 'ended'
  risk?: Risk | null
  workflow?: { id: string; name: string } | null
  slots?: Record<string, { label: string; value: string }>
  progress?: number
  asked?: string | null
  urgent?: boolean
  summary?: string
}

interface LiveState {
  connected: boolean
  calls: LiveCall[]
  /** bumps whenever something changed server-side that lists should refetch */
  version: number
  /** a call asking the owner to pick up (VIP during Focus, OTP handoff, transfer) */
  handoff: Handoff | null
  dismissHandoff: () => void
}

const LiveContext = createContext<LiveState>({ connected: false, calls: [], version: 0, handoff: null, dismissHandoff: () => {} })

export function LiveProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const [connected, setConnected] = useState(false)
  const [calls, setCalls] = useState<Record<string, LiveCall>>({})
  const [version, setVersion] = useState(0)
  const [handoff, setHandoff] = useState<Handoff | null>(null)

  useEffect(() => {
    if (!token) return
    const socket = io({ auth: { token }, transports: ['websocket', 'polling'] })
    const patch = (id: string, fn: (c: LiveCall) => LiveCall) => setCalls(p => (p[id] ? { ...p, [id]: fn(p[id]) } : p))
    const bump = () => setVersion(v => v + 1)

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('call:started', (e: { callId: string; from: string; callerName: string; timestamp: string; isVIP: boolean; risk?: Risk; workflow?: LiveCall['workflow'] }) => {
      setCalls(p => ({ ...p, [e.callId]: { callId: e.callId, from: e.from, callerName: e.callerName, startedAt: e.timestamp, isVIP: e.isVIP, transcript: [], partial: '', status: 'live', risk: e.risk, workflow: e.workflow } }))
    })
    socket.on('call:transcript', (e: { callId: string; speaker: TranscriptLine['speaker']; text: string; lang?: string; textEn?: string; timestamp: string }) =>
      patch(e.callId, c => ({ ...c, partial: e.speaker === 'ai' ? '' : c.partial, transcript: [...c.transcript, { speaker: e.speaker, text: e.text, lang: e.lang, textEn: e.textEn, timestamp: e.timestamp }] })))
    // The caller's language/English arrive after understanding — patch the latest caller line
    socket.on('call:language', (e: { callId: string; lang: string; textEn: string | null }) =>
      patch(e.callId, c => {
        const t = c.transcript.slice()
        const i = t.map(x => x.speaker).lastIndexOf('caller')
        if (i >= 0) t[i] = { ...t[i], lang: e.lang, textEn: e.textEn || undefined }
        return { ...c, transcript: t }
      }))
    socket.on('call:transcript:delta', (e: { callId: string; fullText: string }) => patch(e.callId, c => ({ ...c, partial: e.fullText })))
    socket.on('call:transcript:clear', (e: { callId: string }) => patch(e.callId, c => ({ ...c, partial: '' })))
    socket.on('call:caller-name', (e: { callId: string; callerName: string }) => patch(e.callId, c => ({ ...c, callerName: e.callerName })))
    socket.on('call:flow', (e: { callId: string; workflow: LiveCall['workflow']; slots: LiveCall['slots']; progress: number; asked: string | null }) =>
      patch(e.callId, c => ({ ...c, workflow: e.workflow, slots: e.slots, progress: e.progress, asked: e.asked })))
    socket.on('call:urgent', (e: { callId: string }) => patch(e.callId, c => ({ ...c, urgent: true })))
    socket.on('call:ended', (e: { callId: string }) => {
      patch(e.callId, c => ({ ...c, status: 'ended', partial: '' }))
      setTimeout(() => setCalls(p => { const n = { ...p }; delete n[e.callId]; return n }), 30000)
    })
    socket.on('call:analyzed', (e: { callId: string; summary: string }) => { patch(e.callId, c => ({ ...c, summary: e.summary })); bump() })
    socket.on('booking:requested', bump)
    socket.on('call:handoff', (e: Handoff) => setHandoff(e))

    return () => { socket.disconnect(); setConnected(false) }
  }, [token])

  return (
    <LiveContext.Provider value={{ connected, calls: Object.values(calls).sort((a, b) => b.startedAt.localeCompare(a.startedAt)), version, handoff, dismissHandoff: () => setHandoff(null) }}>
      {children}
    </LiveContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLive() {
  return useContext(LiveContext)
}
