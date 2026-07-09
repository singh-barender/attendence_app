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
import { prisma } from '../db/client';

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

export async function recordFingerprintConfirmation(userId: string): Promise<void> {
  await prisma.biometricEnrollment.create({
    data: { userId, type: BIOMETRIC_ENROLLMENT_TYPE.FINGERPRINT_FLAG },
  });
}

export async function recordFaceEnrollment(
  userId: string,
  embeddings: FaceEmbeddingsInputShape,
): Promise<void> {
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
