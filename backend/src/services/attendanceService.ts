/**
 * Punch-type inference (check-in vs. check-out, ADR-016), the duplicate-
 * punch guard, and verification-attempt audit logging (ADR-019) — the
 * write path for attendance. The server is authoritative for all of this —
 * the client's own guess is UI hinting only (ADR-007's trust-boundary
 * stance applied to punch type too). Reporting/history derivation lives in
 * attendanceReportingService.ts — a separate concern (read path).
 */
import { prisma } from '../db/client';
import type { AttendanceRecord } from '../generated/prisma/client';

export const PUNCH_TYPE = {
  CHECK_IN: 'CHECK_IN',
  CHECK_OUT: 'CHECK_OUT',
} as const;
export type PunchType = (typeof PUNCH_TYPE)[keyof typeof PUNCH_TYPE];

export const VERIFICATION_METHOD = {
  FINGERPRINT: 'FINGERPRINT',
  FACE: 'FACE',
} as const;
export type VerificationMethod = (typeof VERIFICATION_METHOD)[keyof typeof VERIFICATION_METHOD];

export const VERIFICATION_OUTCOME = {
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
} as const;
export type VerificationOutcome = (typeof VERIFICATION_OUTCOME)[keyof typeof VERIFICATION_OUTCOME];

/**
 * A date as YYYY-MM-DD, in the server's local time zone, for an arbitrary
 * instant (defaulting to now). A single server-clock notion of "today" is a
 * deliberate POC-scope simplification — no per-user time zone handling,
 * consistent with the single global SHIFT_START_HOUR (ADR-016 — no
 * multi-tenant support). Accepting a `reference` (rather than always reading
 * `new Date()` internally) is what lets `recordPunch` bucket an offline-
 * resumed punch by *when the user actually punched*, not by whenever the
 * server happened to receive the resumed mutation — see
 * `resolvePunchTimestamp`'s comment for why this exists (a follow-up review
 * finding: without it, a punch queued at 5pm but resumed at 12:05am the next
 * day silently became the wrong day's CHECK_IN instead of the previous day's
 * CHECK_OUT).
 */
export function todayDateString(reference: Date = new Date()): string {
  const year = reference.getFullYear();
  const month = String(reference.getMonth() + 1).padStart(2, '0');
  const day = String(reference.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * How far a client-claimed punch timestamp may diverge from the server's own
 * receipt time before it's treated as unreliable and ignored in favor of
 * server-received time instead. Generous enough to cover a realistic
 * multi-day offline queue (ADR-017 sets no maximum offline duration), narrow
 * enough to catch a badly wrong device clock. Like this codebase's other
 * unreviewed thresholds (`MIN_ENROLLMENT_CONSISTENCY`, `MATCH_THRESHOLD`),
 * this is an engineering judgment call, not empirically calibrated.
 */
const MAX_CLIENT_TIMESTAMP_DRIFT_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Resolves the single *effective* instant a punch is attributed to — the
 * client's claimed local timestamp if present and plausible, server-received
 * time otherwise. Used for everything user-facing: which *day* the punch
 * belongs to (and therefore CHECK_IN-vs-CHECK_OUT inference), the stored
 * `timestamp` itself (displayed check-in/out clock times, CSV export, the
 * session timer, `hoursWorked`/`isLate` in attendanceReportingService.ts).
 *
 * This was originally scoped to date-bucketing only, trusting the client
 * for *which day* while keeping `timestamp` itself as strictly server time —
 * a second follow-up review caught that this produced a self-contradictory
 * result for a whole offline-batched day synced at once (both punches
 * landing within the same second of server-receipt time gives ~0
 * `hoursWorked` and a false `isLate`, while every displayed clock time was
 * still wrong too). Resolving one single effective instant and using it
 * everywhere avoids that inconsistency. The true server-receipt instant
 * isn't discarded — it's kept separately as `AttendanceRecord.serverReceivedAt`,
 * a hidden forensic fact never exposed via GraphQL, so this doesn't fully
 * abandon ADR-004/007's minimal-client-trust stance — it's a deliberate,
 * user-chosen narrowing of it for the one fact (punch time) a client's own
 * clock is the more natural source of truth for.
 */
export function resolvePunchTimestamp(
  clientTimestamp: Date | null | undefined,
  serverReceivedAt: Date,
): Date {
  if (!clientTimestamp) {
    return serverReceivedAt;
  }
  const driftMs = Math.abs(serverReceivedAt.getTime() - clientTimestamp.getTime());
  if (driftMs > MAX_CLIENT_TIMESTAMP_DRIFT_MS) {
    return serverReceivedAt;
  }
  return clientTimestamp;
}

/**
 * Pure decision logic: given the punch types already recorded today, what's
 * the only allowed next punch type? Kept separate from the Prisma query
 * below so it's unit-testable without a database — this is the actual
 * duplicate-punch guard rule, and the guard is worth verifying in isolation.
 */
export function inferNextPunchType(todaysPunchTypes: readonly PunchType[]): PunchType {
  const hasCheckIn = todaysPunchTypes.includes(PUNCH_TYPE.CHECK_IN);
  const hasCheckOut = todaysPunchTypes.includes(PUNCH_TYPE.CHECK_OUT);

  if (!hasCheckIn) {
    return PUNCH_TYPE.CHECK_IN;
  }
  if (!hasCheckOut) {
    return PUNCH_TYPE.CHECK_OUT;
  }
  throw new Error('Already checked out today');
}

async function determineNextPunchType(userId: string, date: string): Promise<PunchType> {
  const todaysRecords = await prisma.attendanceRecord.findMany({
    where: { userId, date },
    select: { type: true },
  });
  return inferNextPunchType(todaysRecords.map((record) => record.type as PunchType));
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}

export interface RecordPunchInput {
  userId: string;
  method: VerificationMethod;
  matchScore?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Client-resolved place name for this punch's coordinates (cosmetic
   * metadata — see the `address` column comment in schema.prisma). */
  address?: string | null;
  /** Client-generated, one per punch attempt (architecture-review-2026-07
   * -16.md's F7) — see the `idempotencyKey` column comment in schema.prisma
   * for why a resumed offline mutation needs this to avoid being silently
   * recorded as the wrong punch type. */
  idempotencyKey?: string | null;
  /** The client's own local timestamp for when the punch actually happened
   * (captured at the moment of the biometric attempt, not at mutation-send
   * time) — resolved via `resolvePunchTimestamp` into the single effective
   * instant used for date-bucketing *and* the stored `timestamp` itself.
   * See that function's comment for the full reasoning (two rounds of
   * follow-up review findings on offline sync). */
  clientTimestamp?: Date | null;
}

export interface RecordPunchResult {
  record: AttendanceRecord;
  type: PunchType;
}

/**
 * Writes the attendance punch. The `@@unique([userId, date, type])`
 * constraint (ADR-016) backs up the application-level check above as a
 * defense against a race between two concurrent requests for the same
 * user/day/type — the app check gives a clear error message in the common
 * case, the DB constraint makes a duplicate impossible even in the race case.
 *
 * If `idempotencyKey` matches an already-recorded punch, that existing
 * record is returned as-is — type-inference never re-runs for it. Without
 * this, a mutation that actually succeeded server-side but whose response
 * was lost in transit (not "never sent" — TanStack Query's offline queue
 * already handles that case correctly) would, on retry, be re-evaluated
 * against the now-changed "today's records" state and could be recorded as
 * the wrong punch type (F7).
 *
 * `date` and the stored `timestamp` are both derived from the single
 * resolved instant `resolvePunchTimestamp` returns — the client's claim when
 * present and plausible, not always server-received time — a punch queued
 * offline and resumed after local midnight must still infer against *its
 * own* day's records and display *its own* clock time, not get silently
 * reassigned to whenever the server happened to receive the resumed
 * mutation. `serverReceivedAt` always holds the true receipt instant
 * regardless, as a hidden forensic fact (never exposed via GraphQL).
 */
export async function recordPunch(input: RecordPunchInput): Promise<RecordPunchResult> {
  if (input.idempotencyKey) {
    const existing = await prisma.attendanceRecord.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      // The key is a global-uniqueness column, not scoped per user — without
      // this check, a caller who guessed or intercepted another user's
      // idempotencyKey would get that user's own AttendanceRecord back
      // (userId, matchScore, geolocation) despite having verified nothing
      // for that account. Rejecting outright, not falling through to
      // "treat as no match" — retrying the create with the same key value
      // would just hit the column's own unique-constraint violation and
      // surface a confusing "Already punched in for today" error instead.
      if (existing.userId !== input.userId) {
        throw new Error('Invalid idempotency key.');
      }
      return { record: existing, type: existing.type as PunchType };
    }
  }

  const serverReceivedAt = new Date();
  const effectiveTimestamp = resolvePunchTimestamp(input.clientTimestamp, serverReceivedAt);
  const date = todayDateString(effectiveTimestamp);
  const type = await determineNextPunchType(input.userId, date);

  try {
    const record = await prisma.attendanceRecord.create({
      data: {
        userId: input.userId,
        date,
        type,
        timestamp: effectiveTimestamp,
        serverReceivedAt,
        method: input.method,
        matchScore: input.matchScore ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        address: input.address ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
    return { record, type };
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw new Error('Already punched in for today — try again');
    }
    throw error;
  }
}

export interface LogVerificationAttemptInput {
  userId: string | null;
  method: VerificationMethod;
  outcome: VerificationOutcome;
  matchScore?: number | null;
}

/**
 * Logs every verification attempt, success or failure (ADR-019) — callers
 * must invoke this on both paths, not just when a punch is actually
 * recorded, since a failed verification is itself the security-relevant
 * event worth auditing.
 */
export async function logVerificationAttempt(input: LogVerificationAttemptInput): Promise<void> {
  await prisma.verificationAttempt.create({
    data: {
      userId: input.userId,
      method: input.method,
      outcome: input.outcome,
      matchScore: input.matchScore ?? null,
    },
  });
}
