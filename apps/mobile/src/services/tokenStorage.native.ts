/**
 * Persists the session JWT issued at punch-in (architecture.md) so
 * authenticated queries (attendance history, CSV export, task 1.19+) can
 * reuse it without requiring another punch. Android-only file for now — a
 * `tokenStorage.web.ts` counterpart arrives with Phase 3 web support, using
 * a different storage mechanism (browsers have no `expo-secure-store`).
 */
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'attendance.sessionToken';

export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function loadToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
