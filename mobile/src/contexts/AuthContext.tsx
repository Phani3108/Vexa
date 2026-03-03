/**
 * AuthContext — global auth + user config state.
 *
 * After login (POST /api/users/setup) the phoneNumber is stored here and
 * passed to the API service.  The full UserConfig is fetched once and shared.
 *
 * Socket.io is connected / disconnected in tandem with login / logout.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserConfig } from '../types/api';
import * as api from '../services/api';
import socketService from '../services/socket';

interface AuthState {
  isLoading: boolean;
  isLoggedIn: boolean;
  phoneNumber: string | null;
  userConfig: UserConfig | null;
}

interface AuthContextValue extends AuthState {
  /**
   * Call POST /api/users/setup then persist session.
   * Returns `isNewUser` — true if this phone number was just created.
   */
  login: (phoneNumber: string) => Promise<{ isNewUser: boolean }>;
  /** Clear session */
  logout: () => void;
  /** Re-fetch user config from backend */
  refreshConfig: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY_PHONE = '@aicaller_phone';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isLoggedIn: false,
    phoneNumber: null,
    userConfig: null,
  });

  // ── Bootstrap: check if we have a saved session ──────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY_PHONE);
        if (saved) {
          api.setPhoneNumber(saved);
          const { config } = await api.getUserConfig();
          socketService.connect();
          socketService.joinUserRoom(saved);
          setState({ isLoading: false, isLoggedIn: true, phoneNumber: saved, userConfig: config });
        } else {
          setState(s => ({ ...s, isLoading: false }));
        }
      } catch {
        // Config fetch failed — treat as logged out
        await AsyncStorage.removeItem(STORAGE_KEY_PHONE);
        setState(s => ({ ...s, isLoading: false }));
      }
    })();
  }, []);

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async (phoneNumber: string): Promise<{ isNewUser: boolean }> => {
    api.setPhoneNumber(phoneNumber);

    // Render free-tier servers cold-start and the first request often fails.
    // Retry up to 3 times with a short delay before surfacing the error.
    let lastError: Error = new Error('Could not connect to server.');
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { config, isNewUser } = await api.setupUser({ phoneNumber });
        await AsyncStorage.setItem(STORAGE_KEY_PHONE, phoneNumber);
        socketService.connect();
        socketService.joinUserRoom(phoneNumber);
        setState({ isLoading: false, isLoggedIn: true, phoneNumber, userConfig: config });
        return { isNewUser };
      } catch (err: any) {
        lastError = err;
        if (attempt < 3) {
          console.log(`[Auth] Login attempt ${attempt} failed, retrying in 2s…`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    throw lastError;
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    socketService.disconnect();
    api.setPhoneNumber('');
    AsyncStorage.removeItem(STORAGE_KEY_PHONE);
    setState({ isLoading: false, isLoggedIn: false, phoneNumber: null, userConfig: null });
  }, []);

  // ── Refresh config ────────────────────────────────────────────────────────
  const refreshConfig = useCallback(async () => {
    if (!state.phoneNumber) {return;}
    const { config } = await api.getUserConfig();
    setState(s => ({ ...s, userConfig: config }));
  }, [state.phoneNumber]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshConfig }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {throw new Error('useAuth must be inside AuthProvider');}
  return ctx;
}
