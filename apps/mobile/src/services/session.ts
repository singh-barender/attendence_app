/**
 * Ends the active session everywhere it is held (user-requested logout):
 * revokes the token server-side (architecture-review-2026-07-16.md's F8),
 * then clears the persisted token (SecureStore), the in-memory Authorization
 * header, and the cached user/attendance data. This is the single source of
 * truth for "log out" so the explicit Log Out action and account deletion
 * clear exactly the same state — no path can leave a stale token or cached
 * profile behind that would let a protected screen keep working after
 * sign-out (ADR-004).
 *
 * The server revocation happens *before* local cleanup, using the
 * still-valid token — best-effort: if it fails (offline, expired token,
 * etc.), local logout still proceeds regardless, since the user's intent to
 * sign out of *this device* shouldn't be blocked by network availability.
 * Without the server-side call, "log out" only ever meant "this device
 * forgets the token" — the token itself remained fully valid for its whole
 * 7-day life if captured or left behind.
 *
 * The caller navigates to Login afterward (via `navigation.reset`, so the
 * back gesture can't return into an authenticated screen). `queryClient.clear()`
 * drops every cached query *and* mutation, so a different person picking up
 * the device starts from a clean, unauthenticated state.
 */
import type { QueryClient } from '@tanstack/react-query';
import { LogoutDocument } from '../generated/graphql';
import { setAuthToken } from './graphqlClient';
import { fetcher } from './graphqlFetcher';
import { clearToken } from './tokenStorage';

export async function logout(queryClient: QueryClient): Promise<void> {
  try {
    await fetcher(LogoutDocument, {})();
  } catch {
    // Best-effort — see this file's header comment.
  }
  await clearToken();
  setAuthToken(null);
  queryClient.clear();
}
