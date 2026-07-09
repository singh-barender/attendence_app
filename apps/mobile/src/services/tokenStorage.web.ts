/**
 * Web counterpart to tokenStorage.native.ts (Phase 3) — browsers have no
 * `expo-secure-store`, so this uses `localStorage` instead. Same interface,
 * same key, wrapped in Promises purely to match the native module's async
 * signature (localStorage itself is synchronous) so callers don't need to
 * know which platform they're on.
 */
const TOKEN_KEY = 'attendance.sessionToken';

export async function saveToken(token: string): Promise<void> {
  localStorage.setItem(TOKEN_KEY, token);
}

export async function loadToken(): Promise<string | null> {
  return localStorage.getItem(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  localStorage.removeItem(TOKEN_KEY);
}
