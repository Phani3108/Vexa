/**
 * AuthContext — global auth + user config state.
 *
 * Login is OTP-based:
 *   1. requestOtp(phone)            → POST /api/auth/otp/request
 *   2. verifyOtp(phone, code)       → POST /api/auth/otp/verify → { user, token, refreshToken }
 *
 * The token pair is persisted in AsyncStorage, attached to every API request
 * (services/api.ts) and sent in the Socket.io handshake. When the API layer
 * silently refreshes the token we persist the new pair and reconnect the
 * socket; if the refresh token is rejected we log out.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthTokens, UserConfig } from '../types/api';
import * as api from '../services/api';
import socketService from '../services/socket';
import * as transcriptStore from '../services/transcriptStore';

interface AuthState {
  isLoading: boolean;
  isLoggedIn: boolean;
  userId: string | null;
  phoneNumber: string | null;
  userConfig: UserConfig | null;
}

interface AuthContextValue extends AuthState {
  /** Send an OTP to the phone. Returns devCode when the backend is in dev mode. */
  requestOtp: (phoneNumber: string) => Promise<{ devCode?: string }>;
  /** Verify the OTP and start a session. */
  verifyOtp: (phoneNumber: string, code: string, name?: string) => Promise<{ isNewUser: boolean }>;
  /** Clear session */
  logout: () => void;
  /** Re-fetch user config from backend */
  refreshConfig: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY_SESSION = '@vexa_session';
/** Pre-OTP builds stored only the phone number (no token) — clear it. */
const LEGACY_STORAGE_KEY_PHONE = '@aicaller_phone';

interface StoredSession extends AuthTokens {
  userId: string;
  phoneNumber: string;
}

const LOGGED_OUT: AuthState = {
  isLoading: false,
  isLoggedIn: false,
  userId: null,
  phoneNumber: null,
  userConfig: null,
};

async function readSession(): Promise<StoredSession | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_SESSION);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (parsed?.token && parsed?.refreshToken) {
      return parsed as StoredSession;
    }
  } catch {
    // corrupt entry — treat as logged out
  }
  return null;
}

async function writeSession(session: StoredSession) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
  } catch (err) {
    console.warn('[Auth] Failed to persist session', err);
  }
}

async function clearStoredSession() {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY_SESSION);
    await AsyncStorage.removeItem(LEGACY_STORAGE_KEY_PHONE);
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ ...LOGGED_OUT, isLoading: true });

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    socketService.disconnect();
    api.setAuthTokens(null);
    transcriptStore.reset();
    clearStoredSession();
    setState(LOGGED_OUT);
  }, []);

  // ── Wire API/socket token lifecycle ──────────────────────────────────────
  useEffect(() => {
    api.setTokensRefreshedListener(async tokens => {
      socketService.updateToken(tokens.token);
      const stored = await readSession();
      if (stored) {
        await writeSession({ ...stored, ...tokens });
      }
    });
    api.setAuthFailureListener(() => {
      console.log('[Auth] Session expired — logging out');
      logout();
    });
    // Handshake rejected (expired token): refresh, which reconnects via the listener above.
    socketService.setAuthErrorHandler(() => {
      api.refreshSession().catch(err => {
        if (err instanceof api.ApiError && (err.status === 401 || err.status === 403)) {
          return; // auth-failure listener already logged us out
        }
        // Network hiccup — try the socket again shortly.
        setTimeout(() => socketService.reconnect(), 5000);
      });
    });
    return () => {
      api.setTokensRefreshedListener(null);
      api.setAuthFailureListener(null);
      socketService.setAuthErrorHandler(null);
    };
  }, [logout]);

  // ── Bootstrap: restore a saved session ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await readSession();
      if (!saved) {
        await AsyncStorage.removeItem(LEGACY_STORAGE_KEY_PHONE).catch(() => {});
        if (!cancelled) {
          setState(LOGGED_OUT);
        }
        return;
      }

      api.setAuthTokens({ token: saved.token, refreshToken: saved.refreshToken });
      try {
        const { config } = await api.getUserConfig();
        if (cancelled) {
          return;
        }
        // The token may have been refreshed during getUserConfig()
        socketService.connect(api.getAuthTokens()?.token || saved.token);
        setState({
          isLoading: false,
          isLoggedIn: true,
          userId: saved.userId,
          phoneNumber: saved.phoneNumber,
          userConfig: config,
        });
      } catch (err: any) {
        if (cancelled) {
          return;
        }
        const status = err instanceof api.ApiError ? err.status : 0;
        if (status === 401 || status === 403 || status === 404) {
          // Session rejected or user gone — start over.
          logout();
          return;
        }
        // Network / server error: keep the session; screens can retry and
        // refreshConfig() will fill in userConfig later.
        const tokens = api.getAuthTokens();
        if (!tokens) {
          logout();
          return;
        }
        socketService.connect(tokens.token);
        setState({
          isLoading: false,
          isLoggedIn: true,
          userId: saved.userId,
          phoneNumber: saved.phoneNumber,
          userConfig: null,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [logout]);

  // ── OTP login ─────────────────────────────────────────────────────────────
  const requestOtp = useCallback(async (phoneNumber: string) => {
    const res = await api.requestOtp(phoneNumber);
    return { devCode: res.devCode };
  }, []);

  const verifyOtp = useCallback(
    async (phoneNumber: string, code: string, name?: string): Promise<{ isNewUser: boolean }> => {
      const { user, token, refreshToken } = await api.verifyOtp(phoneNumber, code, name);
      api.setAuthTokens({ token, refreshToken });

      const session: StoredSession = {
        token,
        refreshToken,
        userId: user.userId,
        phoneNumber: user.phoneNumber || phoneNumber,
      };
      await writeSession(session);
      await AsyncStorage.removeItem(LEGACY_STORAGE_KEY_PHONE).catch(() => {});

      let config: UserConfig | null = null;
      try {
        config = (await api.getUserConfig()).config;
      } catch (err) {
        console.warn('[Auth] Could not load config after login', err);
      }

      socketService.connect(api.getAuthTokens()?.token || token);
      setState({
        isLoading: false,
        isLoggedIn: true,
        userId: session.userId,
        phoneNumber: session.phoneNumber,
        userConfig: config,
      });
      return { isNewUser: !!user.isNewUser };
    },
    [],
  );

  // ── Refresh config ────────────────────────────────────────────────────────
  const refreshConfig = useCallback(async () => {
    if (!api.getAuthTokens()) {
      return;
    }
    const { config } = await api.getUserConfig();
    setState(s => (s.isLoggedIn ? { ...s, userConfig: config } : s));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, requestOtp, verifyOtp, logout, refreshConfig }),
    [state, requestOtp, verifyOtp, logout, refreshConfig],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be inside AuthProvider');
  }
  return ctx;
}
