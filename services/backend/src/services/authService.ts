/**
 * Password hashing + verification for account access (ADR-030). bcrypt via
 * the pure-JS `bcryptjs` (no native build on the backend). The plaintext
 * password is never stored and never logged — only the salted hash lives in
 * `User.passwordHash`.
 *
 * This authenticates *dashboard access* only. The attendance punch itself is
 * still a biometric event re-verified server-side (ADR-004/ADR-007) — adding
 * a password does not weaken or replace that boundary; it sits in front of it
 * so one person can't open the app onto another's data (the privacy gap
 * ADR-004's biometric-is-everything model left open).
 */
import { MIN_PASSWORD_LENGTH } from '@attendance-app/shared-types';
import bcrypt from 'bcryptjs';

/** Work factor — 10 is bcrypt's common default: strong, and fast enough for a
 * single-instance POC's login/registration (a handful of hashes, not a hot
 * path). */
const BCRYPT_ROUNDS = 10;

/**
 * A fixed, precomputed hash of an arbitrary string — never a real
 * account's password — used only so `verifyPassword` pays the same bcrypt
 * cost whether or not a real hash exists (architecture-review-2026-07-16
 * .md's F5). Computed once at module load (sync is fine here: it runs
 * once, not per-request) rather than comparing against `null` directly,
 * which would return near-instantly and let a timing measurement
 * distinguish "wrong password" from "no such account" even though both
 * produce the same generic error message.
 */
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

/** Validates a plaintext password before hashing (server-authoritative;
 * the client mirrors `MIN_PASSWORD_LENGTH` for immediate feedback). Throws a
 * user-facing message on failure. */
export function assertValidPassword(password: string): void {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertValidPassword(password);
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Constant-time-ish comparison via bcrypt. Returns false (never throws) for a
 * missing hash, so an account that somehow has no password simply can't log
 * in rather than erroring — but always runs a real `bcrypt.compare` against
 * *some* hash (the real one, or `DUMMY_HASH`) rather than short-circuiting,
 * so the response-time profile doesn't leak whether the account exists
 * (F5) — `login.ts`'s generic error message alone wasn't sufficient, since
 * bcrypt's cost is only paid on the real-account path otherwise.
 */
export async function verifyPassword(
  password: string,
  passwordHash: string | null,
): Promise<boolean> {
  const isRealHash = Boolean(passwordHash);
  const matched = await bcrypt.compare(password, passwordHash ?? DUMMY_HASH);
  return isRealHash && matched;
}
