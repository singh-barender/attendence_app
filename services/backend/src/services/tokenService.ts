/**
 * Session JWT issuance/verification — a session token is issued after
 * `login` (email+password, ADR-030) or after a successful biometric
 * punch-in (ADR-004/ADR-007's punch security boundary is unaffected by
 * ADR-030's password login layered in front of dashboard access). Reused by
 * every punch-in mutation and by the auth-context builder for protected
 * queries/mutations.
 *
 * Step-up tokens (below) are a second, distinct, short-lived token type —
 * proof that the caller just re-entered their password, required by
 * sensitive mutations (`reEnrollFace`/`reEnrollFingerprint`) that a merely
 * *valid* (but possibly hours- or days-old) session token shouldn't be
 * sufficient to authorize on its own. They're single-use: `reEnroll.ts`
 * revokes a step-up token immediately after it authorizes a mutation, via
 * the same `RevokedToken` table session tokens use, so a captured or
 * replayed step-up token can't authorize a second biometric replacement
 * within its 5-minute window (found in a follow-up review of F11).
 *
 * Session tokens also carry a `jti` (JWT ID) so `logout` can revoke one
 * specific token server-side (architecture-review-2026-07-16.md's F8) —
 * without this, "log out" only ever cleared client-side storage, and a
 * captured/leftover token remained fully valid for its whole 7-day life
 * regardless. `extractSessionFromAuthHeader` (the one shared auth choke
 * point) checks every token against the revocation list, so this applies
 * uniformly everywhere a session token is accepted.
 *
 * `RevokedToken` rows carry the revoked token's own `expiresAt` (its JWT
 * `exp`), not just when it was revoked — once that timestamp passes, the
 * token could never be presented successfully anyway (it'd fail plain
 * expiry verification), so the row is safe to delete. There's no cron in
 * this single-instance POC (ADR-015), so `revokeToken` opportunistically
 * sweeps past-due rows itself on every call — revocations happen far less
 * often than authenticated requests, so this stays cheap while keeping the
 * table from growing unboundedly (a follow-up review finding).
 */
import { randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { config } from '../config';
import { prisma } from '../db/client';

const JWT_ALGORITHM = 'HS256';
const SESSION_DURATION = '7d';
/** Deliberately short — a step-up token proves "the caller just re-entered
 * their password", not "the caller is logged in" (that's what the session
 * token already proves). Long enough to complete a re-enrollment capture
 * flow in one sitting, short enough that a leaked step-up token is a
 * narrow window, not a standing credential. */
const STEP_UP_DURATION = '5m';
/** Only a step-up token carries this claim — lets `verifyStepUpToken` reject
 * a plain session token even though both are signed with the same key and
 * share the same `sub` claim shape. */
const STEP_UP_PURPOSE = 'step-up';

const secretKey = new TextEncoder().encode(config.jwtSecret);

export async function issueSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId, jti: randomUUID() })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(secretKey);
}

export interface SessionTokenPayload {
  userId: string;
  /** Null only for a token issued before this claim existed (none in
   * practice for a fresh POC database, but harmless to tolerate) — such a
   * token simply can't be individually revoked by `logout`. */
  jti: string | null;
  /** The token's own JWT `exp` (unix seconds), null alongside `jti` for the
   * same pre-existing-token reason. Threaded through so `logout` can record
   * a real `expiresAt` on the `RevokedToken` row instead of guessing one. */
  exp: number | null;
}

export async function verifySessionToken(token: string): Promise<SessionTokenPayload> {
  const { payload } = await jwtVerify(token, secretKey, { algorithms: [JWT_ALGORITHM] });
  if (typeof payload.sub !== 'string') {
    throw new Error('Invalid session token');
  }
  return {
    userId: payload.sub,
    jti: typeof payload.jti === 'string' ? payload.jti : null,
    exp: typeof payload.exp === 'number' ? payload.exp : null,
  };
}

/**
 * Marks a token (session or step-up) permanently invalid, even though it
 * hasn't expired yet (F8, extended to step-up tokens) — called by `logout`
 * with the current request's own session `jti`, and by `reEnroll.ts` with a
 * step-up token's `jti` immediately after it authorizes a mutation. Also
 * opportunistically sweeps any already-expired rows (see this file's header
 * comment) so the table doesn't grow across every revocation forever.
 */
export async function revokeToken(jti: string, expiresAt: Date): Promise<void> {
  await prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.revokedToken.upsert({
    where: { jti },
    create: { jti, expiresAt },
    update: {},
  });
}

async function isTokenRevoked(jti: string | null): Promise<boolean> {
  if (!jti) {
    return false;
  }
  const revoked = await prisma.revokedToken.findUnique({ where: { jti } });
  return revoked !== null;
}

export async function issueStepUpToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId, purpose: STEP_UP_PURPOSE, jti: randomUUID() })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(STEP_UP_DURATION)
    .sign(secretKey);
}

export interface StepUpTokenPayload {
  userId: string;
  jti: string;
  /** Unix seconds — passed to `revokeToken` as the row's `expiresAt` when
   * the caller consumes this token after a successful re-enrollment. */
  exp: number;
}

/**
 * Verifies a step-up token and returns the account it proves a fresh
 * password confirmation for, plus its `jti`/`exp` so the caller can consume
 * it (single-use — see this file's header comment). Throws (never returns
 * null) — every call site is inside a mutation that should hard-fail on an
 * invalid/expired/wrong-type/already-used token, not silently continue. A
 * revoked (already-consumed) step-up token is rejected with the exact same
 * message as an invalid or expired one — a caller can't distinguish "this
 * token was already used" from "this token never existed."
 */
export async function verifyStepUpToken(token: string): Promise<StepUpTokenPayload> {
  const { payload } = await jwtVerify(token, secretKey, { algorithms: [JWT_ALGORITHM] });
  const invalidTokenError = new Error(
    'Invalid or expired step-up confirmation — please re-enter your password.',
  );
  if (
    typeof payload.sub !== 'string' ||
    payload.purpose !== STEP_UP_PURPOSE ||
    typeof payload.jti !== 'string' ||
    typeof payload.exp !== 'number'
  ) {
    throw invalidTokenError;
  }
  if (await isTokenRevoked(payload.jti)) {
    throw invalidTokenError;
  }
  return { userId: payload.sub, jti: payload.jti, exp: payload.exp };
}

/**
 * The shared step-up gate for sensitive, non-reversible account actions
 * (`reEnrollFace`/`reEnrollFingerprint`, `deleteMyAccount`) — verifies the
 * token proves a fresh password confirmation for this exact account, then
 * consumes it (single-use, see `verifyStepUpToken`'s comment) so it can't
 * authorize a second sensitive action from one password entry. Factored out
 * of `reEnroll.ts` once `deleteMyAccount` needed the identical check
 * (account deletion is at least as destructive as re-enrollment, and a
 * follow-up review pointed out it had no server-side step-up gate at all —
 * only a client-side type-to-confirm text match, the same kind of
 * non-boundary F11 already fixed for re-enrollment).
 */
export async function assertStepUp(userId: string, stepUpToken: string): Promise<void> {
  const { userId: stepUpUserId, jti, exp } = await verifyStepUpToken(stepUpToken);
  if (stepUpUserId !== userId) {
    throw new Error('Invalid or expired step-up confirmation — please re-enter your password.');
  }
  await revokeToken(jti, new Date(exp * 1000));
}

const BEARER_PREFIX = 'Bearer ';

/**
 * The one shared "who is making this request" check, used identically by
 * the GraphQL context builder and the one plain HTTP route (CSV export,
 * ADR-014) — not reimplemented per call site (architecture.md's explicit
 * requirement). Returns null rather than throwing, since "unauthenticated"
 * is a normal, expected outcome each caller handles in its own idiom
 * (a GraphQL error vs. an HTTP 401). A structurally valid but *revoked*
 * token (F8) is treated identically to an invalid one here — this is the
 * one choke point that makes revocation actually take effect everywhere a
 * session token is accepted, not just at `logout` itself.
 */
export async function extractSessionFromAuthHeader(
  authHeader: string | undefined,
): Promise<SessionTokenPayload | null> {
  if (!authHeader?.startsWith(BEARER_PREFIX)) {
    return null;
  }
  try {
    const session = await verifySessionToken(authHeader.slice(BEARER_PREFIX.length));
    if (await isTokenRevoked(session.jti)) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}
