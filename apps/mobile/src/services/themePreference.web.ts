/**
 * Web counterpart to themePreference.native.ts (task 4.7) — same pattern
 * as tokenStorage.web.ts: browsers have no `expo-secure-store`, so this
 * uses `localStorage` instead. Same interface, same key.
 */
import type { StoredThemePreference } from './themePreferenceTypes';

const THEME_PREFERENCE_KEY = 'attendance.themePreference';

export async function saveThemePreference(preference: StoredThemePreference): Promise<void> {
  localStorage.setItem(THEME_PREFERENCE_KEY, preference);
}

export async function loadThemePreference(): Promise<StoredThemePreference | null> {
  const value = localStorage.getItem(THEME_PREFERENCE_KEY);
  return value === 'light' || value === 'dark' || value === 'system' ? value : null;
}
