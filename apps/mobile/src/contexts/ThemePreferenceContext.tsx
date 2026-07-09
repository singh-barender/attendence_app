/**
 * Cross-cutting light/dark theme state (task 4.7, ADR-009) — shared
 * between App.tsx (needs the resolved theme name for Tamagui's `<Theme>`)
 * and ProfileScreen (the toggle control), which aren't otherwise reachable
 * from one another through props: ProfileScreen is rendered deep inside
 * the navigation stack, not a direct child of App.tsx. The only Context in
 * this codebase — justified because prop-drilling isn't structurally
 * possible here, unlike every other piece of cross-screen state so far,
 * which has gone through TanStack Query instead.
 *
 * No explicit preference has been saved yet on first launch, so the
 * resolved theme falls back to the OS-level `useColorScheme()` — matching
 * this app's pre-existing (unpersisted, non-toggleable) behavior exactly,
 * just adding an explicit, persisted override on top.
 */
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { loadThemePreference, saveThemePreference } from '../services/themePreference';
import type { ThemePreference } from '../services/themePreferenceTypes';

export type { ThemePreference };

interface ThemePreferenceContextValue {
  resolvedTheme: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | null>(null);

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference | null>(null);

  useEffect(() => {
    loadThemePreference().then(setPreferenceState);
  }, []);

  function setPreference(next: ThemePreference) {
    setPreferenceState(next);
    saveThemePreference(next);
  }

  const resolvedTheme: ThemePreference = preference ?? (systemScheme === 'dark' ? 'dark' : 'light');

  return (
    <ThemePreferenceContext.Provider value={{ resolvedTheme, setPreference }}>
      {children}
    </ThemePreferenceContext.Provider>
  );
}

export function useThemePreference(): ThemePreferenceContextValue {
  const ctx = useContext(ThemePreferenceContext);
  if (!ctx) {
    throw new Error('useThemePreference must be used within a ThemePreferenceProvider');
  }
  return ctx;
}
