import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, session } from './api'
import type { Meta, UserConfig } from './types'

interface AuthState {
  token: string | null
  config: UserConfig | null
  meta: Meta | null
  loading: boolean
  reloadConfig: () => Promise<UserConfig | null>
  setConfig: (c: UserConfig) => void
  signIn: (token: string, refreshToken: string) => Promise<void>
  signOut: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(session.token)
  const [config, setConfig] = useState<UserConfig | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [loading, setLoading] = useState(!!session.token)

  useEffect(() => session.subscribe(setToken), [])

  useEffect(() => {
    api<Meta>('/api/meta', { auth: false }).then(setMeta).catch(() => {})
  }, [])

  const reloadConfig = useCallback(async () => {
    if (!session.token) return null
    try {
      const { config } = await api<{ config: UserConfig }>('/api/users/config')
      setConfig(config)
      return config
    } catch {
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (token) {
      setLoading(true)
      reloadConfig()
    } else {
      setConfig(null)
      setLoading(false)
    }
  }, [token, reloadConfig])

  const signIn = useCallback(async (t: string, rt: string) => {
    session.set(t, rt)
  }, [])

  const signOut = useCallback(() => session.clear(), [])

  return (
    <AuthContext.Provider value={{ token, config, meta, loading, reloadConfig, setConfig, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
