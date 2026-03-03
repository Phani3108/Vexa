/**
 * ThemeContext — global light/dark mode state.
 *
 * Provides current theme colors and a toggle function.
 * Persists the user's preference in AsyncStorage.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Color palettes ──────────────────────────────────────────────────────────

export interface ThemeColors {
  // Backgrounds
  background: string;
  surface: string;         // cards, modals
  surfaceSecondary: string; // search bars, pills, secondary surfaces
  heroBg: string;           // hero section on profile

  // Text
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;      // text on colored backgrounds (always white)

  // Borders & Dividers
  border: string;
  divider: string;

  // Accent
  accent: string;           // #007AFF everywhere
  accentLight: string;      // light tint of accent

  // Status colors (unchanged between themes)
  success: string;
  danger: string;
  warning: string;

  // Tab bar
  tabBarBg: string;
  tabBarBorder: string;

  // Shadows
  shadowColor: string;

  // Input
  inputBg: string;
  placeholderText: string;

  // Specific component colors
  headerBg: string;
  statusBarStyle: 'light-content' | 'dark-content';
}

export const LightTheme: ThemeColors = {
  background: '#F2F2F7',
  surface: '#FFFFFF',
  surfaceSecondary: '#E5E5EA',
  heroBg: '#007AFF',

  textPrimary: '#000000',
  textSecondary: '#666666',
  textTertiary: '#999999',
  textInverse: '#FFFFFF',

  border: '#E5E5E5',
  divider: '#F0F0F0',

  accent: '#007AFF',
  accentLight: '#007AFF15',

  success: '#34C759',
  danger: '#FF3B30',
  warning: '#FF9800',

  tabBarBg: '#FFFFFF',
  tabBarBorder: '#E5E5E5',

  shadowColor: '#000000',

  inputBg: '#E8E8E8',
  placeholderText: '#999999',

  headerBg: '#FFFFFF',
  statusBarStyle: 'dark-content',
};

export const DarkTheme: ThemeColors = {
  background: '#000000',
  surface: '#1C1C1E',
  surfaceSecondary: '#2C2C2E',
  heroBg: '#0A84FF',

  textPrimary: '#FFFFFF',
  textSecondary: '#EBEBF5',
  textTertiary: '#8E8E93',
  textInverse: '#FFFFFF',

  border: '#38383A',
  divider: '#38383A',

  accent: '#0A84FF',
  accentLight: '#0A84FF25',

  success: '#30D158',
  danger: '#FF453A',
  warning: '#FF9F0A',

  tabBarBg: '#1C1C1E',
  tabBarBorder: '#38383A',

  shadowColor: '#000000',

  inputBg: '#2C2C2E',
  placeholderText: '#636366',

  headerBg: '#1C1C1E',
  statusBarStyle: 'light-content',
};

// ── Context ─────────────────────────────────────────────────────────────────

interface ThemeContextValue {
  isDark: boolean;
  colors: ThemeColors;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  isDark: false,
  colors: LightTheme,
  toggleTheme: () => {},
});

const STORAGE_KEY = '@aicaller_theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [isDark, setIsDark] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load saved preference
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved !== null) {
          setIsDark(saved === 'dark');
        } else {
          // Default to system preference
          setIsDark(systemScheme === 'dark');
        }
      } catch {
        setIsDark(false);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark(prev => {
      const next = !prev;
      AsyncStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
      return next;
    });
  }, []);

  const colors = isDark ? DarkTheme : LightTheme;

  return (
    <ThemeContext.Provider value={{ isDark, colors, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
