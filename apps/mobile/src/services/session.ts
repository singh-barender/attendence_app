/**
 * Ends the active session everywhere it is held (user-requested logout):
 * the persisted token (SecureStore), the in-memory Authorization header, and
 * the cached user/attendance data. This is the single source of truth for
 * "log out" so the explicit Log Out action and account deletion clear exactly
 * the same state — no path can leave a stale token or cached profile behind
 * that would let a protected screen keep working after sign-out (ADR-004).
 *
 * The caller navigates to Login afterward (via `navigation.reset`, so the
 * back gesture can't return into an authenticated screen). `queryClient.clear()`
 * drops every cached query *and* mutation, so a different person picking up
 * the device starts from a clean, unauthenticated state.
 */
import type { QueryClient } from '@tanstack/react-query';
import { setAuthToken } from './graphqlClient';
import { clearToken } from './tokenStorage';

export async function logout(queryClient: QueryClient): Promise<void> {
  await clearToken();
  setAuthToken(null);
  queryClient.clear();
}
