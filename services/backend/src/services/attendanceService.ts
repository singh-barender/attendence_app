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
 * Today's date as YYYY-MM-DD, in the server's local time zone. A single
 * server-clock notion of "today" is a deliberate POC-scope simplification —
 * no per-user time zone handling, consistent with the single global
 * SHIFT_START_HOUR (ADR-016 — no multi-tenant support).
 */
export function todayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
 */
export async function recordPunch(input: RecordPunchInput): Promise<RecordPunchResult> {
  const date = todayDateString();
  const type = await determineNextPunchType(input.userId, date);

  try {
    const record = await prisma.attendanceRecord.create({
      data: {
        userId: input.userId,
        date,
        type,
        method: input.method,
        matchScore: input.matchScore ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
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
