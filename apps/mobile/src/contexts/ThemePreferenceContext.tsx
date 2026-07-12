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
import type { StoredThemePreference, ThemePreference } from '../services/themePreferenceTypes';

export type { StoredThemePreference, ThemePreference };

interface ThemePreferenceContextValue {
  resolvedTheme: ThemePreference;
  /** The raw stored/selected preference, including `'system'` — distinct
   * from `resolvedTheme` (always a concrete light/dark) so `ProfileScreen`'s
   * Appearance toggle knows which of its three buttons to highlight
   * (task 4.13 follow-up). */
  preference: StoredThemePreference;
  setPreference: (preference: StoredThemePreference) => void;
}

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | null>(null);

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<StoredThemePreference | null>(null);

  useEffect(() => {
    loadThemePreference().then(setPreferenceState);
  }, []);

  function setPreference(next: StoredThemePreference) {
    setPreferenceState(next);
    saveThemePreference(next);
  }

  // No explicit preference saved yet on first launch reads the same as an
  // explicit 'system' choice — both mean "follow the OS."
  const effectivePreference: StoredThemePreference = preference ?? 'system';
  const resolvedTheme: ThemePreference =
    effectivePreference === 'system'
      ? systemScheme === 'dark'
        ? 'dark'
        : 'light'
      : effectivePreference;

  return (
    <ThemePreferenceContext.Provider
      value={{ resolvedTheme, preference: effectivePreference, setPreference }}
    >
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
