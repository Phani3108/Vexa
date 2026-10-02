/**
 * API client — same-origin in production, proxied to the backend by Vite in dev.
 * Attaches the access token, refreshes it once on 401, and signs out if refresh fails.
 */

const TOKEN_KEY = 'vexa.token'
const REFRESH_KEY = 'vexa.refresh'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

type Listener = (token: string | null) => void
const listeners = new Set<Listener>()

function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function write(key: string, value: string | null) {
  try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key) } catch { /* private mode */ }
}

export const session = {
  get token() { return read(TOKEN_KEY) },
  get refreshToken() { return read(REFRESH_KEY) },
  set(token: string | null, refresh?: string | null) {
    write(TOKEN_KEY, token)
    if (refresh !== undefined) write(REFRESH_KEY, refresh)
    listeners.forEach(l => l(token))
  },
  clear() { this.set(null, null) },
  subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l) } },
}

let refreshing: Promise<boolean> | null = null

async function refresh(): Promise<boolean> {
  const rt = session.refreshToken
  if (!rt) return false
  refreshing ??= (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      })
      if (!res.ok) return false
      const data = await res.json()
      session.set(data.token, data.refreshToken ?? rt)
      return true
    } catch {
      return false
    } finally {
      setTimeout(() => { refreshing = null }, 0)
    }
  })()
  return refreshing
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options
  const doFetch = () => fetch(path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(auth && session.token ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  let res = await doFetch()
  if (res.status === 401 && auth && session.refreshToken) {
    if (await refresh()) res = await doFetch()
    else session.clear()
  }

  const text = await res.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }

  if (!res.ok) {
    const message = (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string')
      ? (data as { error: string }).error
      : `Request failed (${res.status})`
    if (res.status === 401 && auth) session.clear()
    throw new ApiError(message, res.status)
  }
  return data as T
}
