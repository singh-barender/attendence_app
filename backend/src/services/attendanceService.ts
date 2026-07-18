/**
 * Punch-type inference (check-in vs. check-out, ADR-016), the duplicate-
 * punch guard, and verification-attempt audit logging (ADR-019) — the
 * write path for attendance. The server is authoritative for all of this —
 * the client's own guess is UI hinting only (ADR-007's trust-boundary
 * stance applied to punch type too). Reporting/history derivation lives in
 * attendanceReportingService.ts — a separate concern (read path).
 */
import { prisma } from '../db/client';
import { isUniqueConstraintViolation } from '../db/prismaErrors';
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
 * Pure decision logic: given the type of the user's single most recent punch
 * (`null` if they've never punched before), what's the only allowed next
 * type? A strict alternation with no same-day boundary — an open CHECK_IN
 * always demands CHECK_OUT next, anything else (a completed CHECK_OUT, or no
 * prior punch at all) demands CHECK_IN. Kept separate from the Prisma query
 * below so it's unit-testable without a database.
 *
 * Previously this grouped "today's" records by calendar `date` instead
 * (no CHECK_IN yet today -> CHECK_IN; CHECK_IN but no CHECK_OUT -> CHECK_OUT;
 * both -> reject) — a Round 7 review finding: a shift crossing midnight
 * (e.g. 9pm check-in, 5am check-out) has its check-out fall on the *next*
 * calendar date, which that grouping saw as an empty day and misread as a
 * brand-new CHECK_IN — the real departure punch was silently dropped, the
 * shift stayed open forever, and the new day opened with a phantom
 * check-in. Alternating on the most recent punch alone, with no date
 * boundary, infers correctly regardless of what calendar day a punch lands
 * on. See `recordPunch` for how the resulting CHECK_OUT's own `date` is then
 * attributed back to the shift's start day, not the day it happens to end on
 * — what keeps day-summary/hours-worked/CSV/calendar-view pairing intact for
 * exactly this scenario.
 */
export function inferNextPunchType(
  mostRecentPunchType: PunchType | null,
  hoursSinceLastPunch: number | null,
): PunchType {
  if (mostRecentPunchType === PUNCH_TYPE.CHECK_IN) {
    if (hoursSinceLastPunch !== null && hoursSinceLastPunch >= 16) {
      return PUNCH_TYPE.CHECK_IN;
    }
    return PUNCH_TYPE.CHECK_OUT;
  }
  return PUNCH_TYPE.CHECK_IN;
}

/**
 * The user's single most recent punch across all history — not scoped to a
 * calendar date — what `inferNextPunchType` decides against, and, when it's
 * an open CHECK_IN, whose own `date` a resulting CHECK_OUT is stamped with
 * (see `recordPunch`).
 */
async function findMostRecentPunch(userId: string): Promise<AttendanceRecord | null> {
  return prisma.attendanceRecord.findFirst({
    where: { userId },
    orderBy: { timestamp: 'desc' },
  });
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
 * Looks up an already-recorded punch by its idempotency key, independently of
 * `recordPunch` — extracted (Round 6 review finding) so callers in
 * `punchIn.ts` can short-circuit a replayed mutation *before* running
 * liveness/match checks or writing a `VerificationAttempt` row, not just
 * before writing the `AttendanceRecord` itself. Without this, a network-
 * retried-but-already-succeeded punch got a fresh SUCCESS row appended to the
 * audit trail on every retry — a false "verified again" event for something
 * that was never re-verified — even though the resulting `AttendanceRecord`
 * itself was correctly deduplicated.
 *
 * The key is a global-uniqueness column, not scoped per user — without the
 * ownership check below, a caller who guessed or intercepted another user's
 * idempotencyKey would get that user's own AttendanceRecord back (userId,
 * matchScore, geolocation) despite having verified nothing for that account.
 * Rejecting outright, not falling through to "treat as no match" — retrying
 * the create with the same key value would just hit the column's own
 * unique-constraint violation and surface a confusing "Already punched in
 * for today" error instead.
 */
export async function findPunchByIdempotencyKey(
  userId: string,
  idempotencyKey: string,
): Promise<RecordPunchResult | null> {
  const existing = await prisma.attendanceRecord.findUnique({ where: { idempotencyKey } });
  if (!existing) {
    return null;
  }
  if (existing.userId !== userId) {
    throw new Error('Invalid idempotency key.');
  }
  return { record: existing, type: existing.type as PunchType };
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
 * the wrong punch type (F7). Callers (`punchIn.ts`) already check
 * `findPunchByIdempotencyKey` themselves before reaching here (so a replay
 * never re-logs a verification attempt) — this second check is what actually
 * makes the write path safe against a race between two concurrent replays of
 * the same key, not just an optimization.
 *
 * The stored `timestamp` is derived from the single resolved instant
 * `resolvePunchTimestamp` returns — the client's claim when present and
 * plausible, not always server-received time — so a punch queued offline
 * and resumed later still displays *its own* clock time, not whenever the
 * server happened to receive the resumed mutation. `serverReceivedAt` always
 * holds the true receipt instant regardless, as a hidden forensic fact
 * (never exposed via GraphQL).
 *
 * `date`, by contrast, is *not* simply "the calendar day `effectiveTimestamp`
 * falls on" once this is inferred as a CHECK_OUT (Round 7 review finding): a
 * shift crossing midnight must still report as one same-day pair, so a
 * CHECK_OUT is stamped with the *check-in's* own `date`, not the day the
 * checkout itself happens to land on — otherwise `attendanceReportingService
 * .ts`'s per-date grouping would split the pair into an orphaned checkout on
 * one date and a perpetually-open check-in on the previous one. A CHECK_IN
 * still gets `effectiveTimestamp`'s own calendar day, same as before.
 */
export async function recordPunch(input: RecordPunchInput): Promise<RecordPunchResult> {
  if (input.idempotencyKey) {
    const existing = await findPunchByIdempotencyKey(input.userId, input.idempotencyKey);
    if (existing) {
      return existing;
    }
  }

  const serverReceivedAt = new Date();
  const effectiveTimestamp = resolvePunchTimestamp(input.clientTimestamp, serverReceivedAt);
  const mostRecentPunch = await findMostRecentPunch(input.userId);
  let hoursSinceLastPunch: number | null = null;
  if (mostRecentPunch) {
    hoursSinceLastPunch =
      (effectiveTimestamp.getTime() - mostRecentPunch.timestamp.getTime()) / (1000 * 60 * 60);
  }
  const type = inferNextPunchType(
    mostRecentPunch ? (mostRecentPunch.type as PunchType) : null,
    hoursSinceLastPunch,
  );
  const date =
    type === PUNCH_TYPE.CHECK_OUT && mostRecentPunch
      ? mostRecentPunch.date
      : todayDateString(effectiveTimestamp);

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
