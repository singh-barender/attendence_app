/**
 * Writes BiometricEnrollment rows for registration steps 2/3 and for
 * profile-screen re-enrollment (task 4.2, ADR-018). Never stores a raw
 * fingerprint template — only a confirmation flag (ADR-005) — and stores
 * face embeddings as JSON-stringified vectors, not images (ADR-006).
 *
 * Re-enrollment appends new rows rather than overwriting, but marks prior
 * rows of the same type *and same embedding model* `supersededAt` (set, not
 * deleted) in the same transaction — ADR-018 requires old enrollments stay
 * around for audit, while `getFaceEmbeddings`/`getEnrollmentStatus` below
 * only ever consider the active (`supersededAt: null`) set, so a superseded
 * embedding can never still match at punch-in. Scoping supersession to the
 * same model (architecture-review-2026-07-16.md's F3) means re-enrolling
 * face on web doesn't silently kill an existing Android enrollment (or vice
 * versa) — a user can hold one active enrollment per platform/model
 * simultaneously, each independently re-enrollable.
 */
import { cosineSimilarity, type EmbeddingModelId } from '@attendance-app/face-matching';
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

/**
 * Maximum cosine similarity between the frontal shot and each profile shot —
 * the upper-bound counterpart `MIN_ENROLLMENT_CONSISTENCY` never had (a
 * follow-up review finding): without one, submitting the *same* embedding
 * three times over (frontal/left/right all identical, cosine exactly 1.0)
 * passed the lower-bound check trivially, defeating the point of requiring
 * three angles — enrolling with zero real angular variation, entirely
 * server-side-checkable since the client can't be trusted to have actually
 * captured three distinct shots (ADR-007's stance applied here too).
 *
 * Set high (not the 0.98 a first pass might reach for) so genuine same-person
 * angle variation is never at risk of false-rejecting — the existing lower
 * bound's own comment already notes a real front-vs-profile pair "can sit
 * well below a verification threshold," meaning authentic distinct angles
 * normally land well under this ceiling anyway; this constant exists to catch
 * the *literal-duplicate* case specifically; a mostly-frontal-with-minor-turn
 * shot is a quality question for enrollment UX, not this guard. Like
 * `MIN_ENROLLMENT_CONSISTENCY`, this is an engineering judgment call, not
 * empirically calibrated — no real duplicate-vs-genuine enrollment data
 * exists in this environment to tune it against.
 */
export const MAX_ENROLLMENT_SIMILARITY = 0.999;

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

function faceEnrollmentCreateData(
  userId: string,
  embeddings: FaceEmbeddingsInputShape,
  embeddingModel: EmbeddingModelId,
) {
  return [
    {
      userId,
      type: BIOMETRIC_ENROLLMENT_TYPE.FACE_LEFT,
      embedding: JSON.stringify(embeddings.left),
      embeddingModel,
    },
    {
      userId,
      type: BIOMETRIC_ENROLLMENT_TYPE.FACE_RIGHT,
      embedding: JSON.stringify(embeddings.right),
      embeddingModel,
    },
    {
      userId,
      type: BIOMETRIC_ENROLLMENT_TYPE.FACE_FRONTAL,
      embedding: JSON.stringify(embeddings.frontal),
      embeddingModel,
    },
  ];
}

/** Rejects a set of enrollment shots that don't plausibly belong to one
 * person, or that show no real angular variation at all. Compares each
 * profile against the frontal anchor (not left-vs-right, the most dissimilar
 * pair) against the deliberately loose `MIN_ENROLLMENT_CONSISTENCY` floor and
 * the `MAX_ENROLLMENT_SIMILARITY` ceiling. Throwing here is caught by the
 * resolver and surfaced as a normal enrollment error. */
export function assertEnrollmentConsistency(embeddings: FaceEmbeddingsInputShape): void {
  const frontalToLeft = cosineSimilarity([...embeddings.frontal], [...embeddings.left]);
  const frontalToRight = cosineSimilarity([...embeddings.frontal], [...embeddings.right]);
  if (frontalToLeft < MIN_ENROLLMENT_CONSISTENCY || frontalToRight < MIN_ENROLLMENT_CONSISTENCY) {
    throw new Error(
      'Those enrollment photos don’t look like the same person — please retake all three yourself.',
    );
  }
  if (frontalToLeft > MAX_ENROLLMENT_SIMILARITY || frontalToRight > MAX_ENROLLMENT_SIMILARITY) {
    throw new Error(
      'Those enrollment photos look identical — please capture three genuinely different angles.',
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
  embeddingModel: EmbeddingModelId,
): Promise<void> {
  assertEnrollmentConsistency(embeddings);
  await prisma.biometricEnrollment.createMany({
    data: faceEnrollmentCreateData(userId, embeddings, embeddingModel),
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
 * prior active face rows for the *same embedding model* before appending
 * the new set, atomically. Scoped by model (architecture-review-2026-07-16
 * .md's F3) so re-enrolling on one platform doesn't supersede an active
 * enrollment from the other — a user can hold one active enrollment per
 * platform simultaneously. */
export async function reEnrollFace(
  userId: string,
  embeddings: FaceEmbeddingsInputShape,
  embeddingModel: EmbeddingModelId,
): Promise<void> {
  assertEnrollmentConsistency(embeddings);
  await prisma.$transaction([
    prisma.biometricEnrollment.updateMany({
      where: {
        userId,
        type: { in: [...FACE_ENROLLMENT_TYPES] },
        embeddingModel,
        supersededAt: null,
      },
      data: { supersededAt: new Date() },
    }),
    prisma.biometricEnrollment.createMany({
      data: faceEnrollmentCreateData(userId, embeddings, embeddingModel),
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
 * many are currently active) *for the given embedding model only*
 * (architecture-review-2026-07-16.md's F3) for the server's own independent
 * re-match (ADR-007) — this is the actual security boundary, so it's never
 * exposed to a client directly; only `punchInFace`'s resolver reads this to
 * compare against a live embedding server-side. Only the active
 * (`supersededAt: null`) set is considered, so a re-enrolled-away embedding
 * can never match. Filtering by model is what prevents comparing two
 * independently-trained models' embeddings as if they shared a space —
 * an empty result means "no compatible enrollment for this platform," not
 * "not enrolled at all"; callers must not conflate the two.
 */
export async function getFaceEmbeddings(
  userId: string,
  embeddingModel: EmbeddingModelId,
): Promise<number[][]> {
  const enrollments = await prisma.biometricEnrollment.findMany({
    where: { userId, type: { in: [...FACE_ENROLLMENT_TYPES] }, embeddingModel, supersededAt: null },
    select: { embedding: true },
  });

  return enrollments
    .map((enrollment) => enrollment.embedding)
    .filter((embedding): embedding is string => embedding !== null)
    .map((embedding) => JSON.parse(embedding) as number[]);
}

/** Whether this account has *any* active face enrollment at all, regardless
 * of which model produced it — used to distinguish "never enrolled face"
 * from "enrolled, but not on this platform" (see `getFaceEmbeddings`'s doc
 * comment) so `punchInFace` can give an accurate, actionable error for each
 * case rather than one generic "not enrolled" message. */
export async function hasAnyFaceEnrollment(userId: string): Promise<boolean> {
  const count = await prisma.biometricEnrollment.count({
    where: { userId, type: { in: [...FACE_ENROLLMENT_TYPES] }, supersededAt: null },
  });
  return count > 0;
}
