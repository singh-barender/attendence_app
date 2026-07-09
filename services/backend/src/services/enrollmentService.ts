/**
 * Writes BiometricEnrollment rows for registration steps 2 and 3. Never
 * stores a raw fingerprint template — only a confirmation flag (ADR-005) —
 * and stores face embeddings as JSON-stringified vectors, not images
 * (ADR-006).
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
    data: [
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
    ],
  });
}

export interface EnrollmentStatus {
  faceEnrolled: boolean;
  fingerprintEnrolled: boolean;
}

const FACE_ENROLLMENT_TYPES: readonly string[] = [
  BIOMETRIC_ENROLLMENT_TYPE.FACE_LEFT,
  BIOMETRIC_ENROLLMENT_TYPE.FACE_RIGHT,
  BIOMETRIC_ENROLLMENT_TYPE.FACE_FRONTAL,
];

export async function getEnrollmentStatus(userId: string): Promise<EnrollmentStatus> {
  const enrollments = await prisma.biometricEnrollment.findMany({
    where: { userId },
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
 * many exist) for the server's own independent re-match (ADR-007) — this is
 * the actual security boundary, so it's never exposed to a client directly;
 * only `punchInFace`'s resolver reads this to compare against a live
 * embedding server-side.
 */
export async function getFaceEmbeddings(userId: string): Promise<number[][]> {
  const enrollments = await prisma.biometricEnrollment.findMany({
    where: { userId, type: { in: [...FACE_ENROLLMENT_TYPES] } },
    select: { embedding: true },
  });

  return enrollments
    .map((enrollment) => enrollment.embedding)
    .filter((embedding): embedding is string => embedding !== null)
    .map((embedding) => JSON.parse(embedding) as number[]);
}
