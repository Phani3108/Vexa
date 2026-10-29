import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

interface Gsi { accounts: { id: { initialize: (o: object) => void; renderButton: (el: HTMLElement, o: object) => void } } }
declare global { interface Window { google?: Gsi } }

let loading: Promise<void> | null = null
function loadGsi(): Promise<void> {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => { loading = null; reject(new Error('Could not load Google sign-in')) }
    document.head.appendChild(s)
  })
  return loading
}

/** "Sign in with Google" (Google Identity Services). Shown only when the server has GOOGLE_CLIENT_ID. */
export default function GoogleButton({ clientId, onToken, onError }: { clientId: string; onToken: (token: string, refresh: string) => void; onError: (msg: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const cb = useRef({ onToken, onError })
  cb.current = { onToken, onError }

  useEffect(() => {
    let alive = true
    loadGsi().then(() => {
      if (!alive || !box.current || !window.google) return
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }: { credential: string }) => {
          try {
            const r = await api<{ token: string; refreshToken: string }>('/api/auth/google', { method: 'POST', body: { credential, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }, auth: false })
            cb.current.onToken(r.token, r.refreshToken)
          } catch (e) {
            cb.current.onError(e instanceof Error ? e.message : 'Google sign-in failed')
          }
        },
      })
      window.google.accounts.id.renderButton(box.current, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', width: 300 })
      setReady(true)
    }).catch(e => cb.current.onError(e.message))
    return () => { alive = false }
  }, [clientId])

  return <div ref={box} style={{ display: 'flex', justifyContent: 'center', minHeight: ready ? undefined : 44 }} />
}
