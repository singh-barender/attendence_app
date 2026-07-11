/**
 * Writes BiometricEnrollment rows for registration steps 2/3 and for
 * profile-screen re-enrollment (task 4.2, ADR-018). Never stores a raw
 * fingerprint template — only a confirmation flag (ADR-005) — and stores
 * face embeddings as JSON-stringified vectors, not images (ADR-006).
 *
 * Re-enrollment appends new rows rather than overwriting, but marks prior
 * rows of the same type `supersededAt` (set, not deleted) in the same
 * transaction — ADR-018 requires old enrollments stay around for audit,
 * while `getFaceEmbeddings`/`getEnrollmentStatus` below only ever consider
 * the active (`supersededAt: null`) set, so a superseded embedding can
 * never still match at punch-in.
 */
import { cosineSimilarity } from '@attendance-app/face-matching';
import { prisma } from '../db/client';

/**
 * Minimum cosine similarity between the frontal enrollment shot and each
 * profile shot for the three to be accepted as the *same person* (anti-
 * buddy-punching: you can't enroll a friend's face alongside your own).
 *
 * Deliberately LOOSE — three angles of one person are meant to differ, and a
 * front-vs-profile pair of the same person can sit well below a verification
 * threshold, so this only rejects a grossly different face, never legitimate
 * angle variation (a tight value here would block real registrations). It's a
 * sanity guard layered under the actual security boundary (the server's
 * per-punch re-match, ADR-007), not a replacement for it. Tune upward only
 * with real same-person/different-person enrollment data.
 */
export const MIN_ENROLLMENT_CONSISTENCY = 0.2;

export const BIOMETRIC_ENROLLMENT_TYPE = {
  FACE_LEFT: 'FACE_LEFT',
  FACE_RIGHT: 'FACE_RIGHT',
  FACE_FRONTAL: 'FACE_FRONTAL',
  FINGERPRINT_FLAG: 'FINGERPRINT_FLAG',
} as const;

export interface FaceEmbeddingsInputShape {
  left: readonly number[];
  right: readonly number[];
  frontal: readonly number[];
}

const FACE_ENROLLMENT_TYPES: readonly string[] = [
  BIOMETRIC_ENROLLMENT_TYPE.FACE_LEFT,
  BIOMETRIC_ENROLLMENT_TYPE.FACE_RIGHT,
  BIOMETRIC_ENROLLMENT_TYPE.FACE_FRONTAL,
];

function faceEnrollmentCreateData(userId: string, embeddings: FaceEmbeddingsInputShape) {
  return [
    {
      userId,
      type: BIOMETRIC_ENROLLMENT_TYPE.FACE_LEFT,
      embedding: JSON.stringify(embeddings.left),
    },
    {
      userId,
      type: BIOMETRIC_ENROLLMENT_TYPE.FACE_RIGHT,
      embedding: JSON.stringify(embeddings.right),
    },
    {
      userId,
      type: BIOMETRIC_ENROLLMENT_TYPE.FACE_FRONTAL,
      embedding: JSON.stringify(embeddings.frontal),
    },
  ];
}

/** Rejects a set of enrollment shots that don't plausibly belong to one
 * person. Compares each profile against the frontal anchor (not left-vs-right,
 * the most dissimilar pair) against the deliberately loose
 * `MIN_ENROLLMENT_CONSISTENCY` bar. Throwing here is caught by the resolver
 * and surfaced as a normal enrollment error. */
export function assertEnrollmentConsistency(embeddings: FaceEmbeddingsInputShape): void {
  const frontalToLeft = cosineSimilarity([...embeddings.frontal], [...embeddings.left]);
  const frontalToRight = cosineSimilarity([...embeddings.frontal], [...embeddings.right]);
  if (frontalToLeft < MIN_ENROLLMENT_CONSISTENCY || frontalToRight < MIN_ENROLLMENT_CONSISTENCY) {
    throw new Error(
      'Those enrollment photos don’t look like the same person — please retake all three yourself.',
    );
  }
}

export async function recordFingerprintConfirmation(userId: string): Promise<void> {
  await prisma.biometricEnrollment.create({
    data: { userId, type: BIOMETRIC_ENROLLMENT_TYPE.FINGERPRINT_FLAG },
  });
}

export async function recordFaceEnrollment(
  userId: string,
  embeddings: FaceEmbeddingsInputShape,
): Promise<void> {
  assertEnrollmentConsistency(embeddings);
  await prisma.biometricEnrollment.createMany({
    data: faceEnrollmentCreateData(userId, embeddings),
  });
}

/** Re-enrollment counterpart of `recordFingerprintConfirmation` — supersedes
 * any prior active fingerprint row before appending the new one, atomically. */
export async function reEnrollFingerprint(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.biometricEnrollment.updateMany({
      where: {
        userId,
        type: BIOMETRIC_ENROLLMENT_TYPE.FINGERPRINT_FLAG,
        supersededAt: null,
      },
      data: { supersededAt: new Date() },
    }),
    prisma.biometricEnrollment.create({
      data: { userId, type: BIOMETRIC_ENROLLMENT_TYPE.FINGERPRINT_FLAG },
    }),
  ]);
}

/** Re-enrollment counterpart of `recordFaceEnrollment` — supersedes any
 * prior active face rows before appending the new set, atomically. */
export async function reEnrollFace(
  userId: string,
  embeddings: FaceEmbeddingsInputShape,
): Promise<void> {
  assertEnrollmentConsistency(embeddings);
  await prisma.$transaction([
    prisma.biometricEnrollment.updateMany({
      where: { userId, type: { in: [...FACE_ENROLLMENT_TYPES] }, supersededAt: null },
      data: { supersededAt: new Date() },
    }),
    prisma.biometricEnrollment.createMany({
      data: faceEnrollmentCreateData(userId, embeddings),
    }),
  ]);
}

export interface EnrollmentStatus {
  faceEnrolled: boolean;
  fingerprintEnrolled: boolean;
}

export async function getEnrollmentStatus(userId: string): Promise<EnrollmentStatus> {
  const enrollments = await prisma.biometricEnrollment.findMany({
    where: { userId, supersededAt: null },
    select: { type: true },
  });

  return {
    faceEnrolled: enrollments.some((e) => FACE_ENROLLMENT_TYPES.includes(e.type)),
    fingerprintEnrolled: enrollments.some(
      (e) => e.type === BIOMETRIC_ENROLLMENT_TYPE.FINGERPRINT_FLAG,
    ),
  };
}

/**
 * Fetches this user's enrolled face embeddings (left/right/frontal, however
 * many are currently active) for the server's own independent re-match
 * (ADR-007) — this is the actual security boundary, so it's never exposed to
 * a client directly; only `punchInFace`'s resolver reads this to compare
 * against a live embedding server-side. Only the active (`supersededAt:
 * null`) set is considered, so a re-enrolled-away embedding can never match.
 */
export async function getFaceEmbeddings(userId: string): Promise<number[][]> {
  const enrollments = await prisma.biometricEnrollment.findMany({
    where: { userId, type: { in: [...FACE_ENROLLMENT_TYPES] }, supersededAt: null },
    select: { embedding: true },
  });

  return enrollments
    .map((enrollment) => enrollment.embedding)
    .filter((embedding): embedding is string => embedding !== null)
    .map((embedding) => JSON.parse(embedding) as number[]);
}
