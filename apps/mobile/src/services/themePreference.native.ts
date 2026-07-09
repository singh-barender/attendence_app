/**
 * Persists the user's explicit light/dark theme override (task 4.7,
 * ADR-009) — same platform-split pattern as tokenStorage.native.ts/.web.ts.
 * A theme preference isn't sensitive data (unlike the session JWT), but
 * `expo-secure-store` is already a dependency this app uses for small
 * string values, so it's reused here rather than adding a new storage
 * dependency (e.g. AsyncStorage) for a single non-sensitive setting.
 */
import * as SecureStore from 'expo-secure-store';
import type { ThemePreference } from './themePreferenceTypes';

const THEME_PREFERENCE_KEY = 'attendance.themePreference';

export async function saveThemePreference(preference: ThemePreference): Promise<void> {
  await SecureStore.setItemAsync(THEME_PREFERENCE_KEY, preference);
}

export async function loadThemePreference(): Promise<ThemePreference | null> {
  const value = await SecureStore.getItemAsync(THEME_PREFERENCE_KEY);
  return value === 'light' || value === 'dark' ? value : null;
}
