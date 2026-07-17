/**
 * Generates a client-side idempotency key for a single punch attempt
 * (architecture-review-2026-07-16.md's F7) — deliberately not
 * cryptographically random (no new native dependency/rebuild needed for
 * this): the key only needs to be unique enough to distinguish one user's
 * one attempt from another, not to resist deliberate forgery, since a
 * forged/reused key can only ever cause a *dedupe* (returning the original
 * result), never grant extra trust.
 *
 * Call once per NEW user-initiated attempt, not per retry — an offline-
 * queued mutation that later resumes must reuse the same key (TanStack
 * Query's persisted-mutation pattern already preserves whatever key was in
 * the mutation's variables at the time it was queued, so the caller simply
 * generates the key before the first `mutate()` call and never regenerates
 * it for that same attempt).
 */
export function generateIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
