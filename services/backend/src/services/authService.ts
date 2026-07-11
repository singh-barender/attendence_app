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

/** Constant-time-ish comparison via bcrypt. Returns false (never throws) for a
 * missing hash, so an account that somehow has no password simply can't log
 * in rather than erroring. */
export async function verifyPassword(
  password: string,
  passwordHash: string | null,
): Promise<boolean> {
  if (!passwordHash) {
    return false;
  }
  return bcrypt.compare(password, passwordHash);
}
