/**
 * Integration test for the full happy path — register -> login -> punch-in ->
 * history -> CSV export — exercised through the real GraphQL schema and the
 * one plain HTTP route, via Fastify's own `app.inject()` (ADR-010, no
 * supertest) against a real (isolated) SQLite database, not mocks
 * (coding-standards.md).
 *
 * Auth model (ADR-030): registration sets a password; `login` issues the
 * session token; punches require that token. So the token here comes from
 * `login`, not from the punch itself.
 */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { prisma } from './db/client';

interface GraphQLResponse<T = Record<string, unknown>> {
  data: T | null;
  errors?: { message: string }[];
}

describe('backend integration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  async function graphql<T = Record<string, unknown>>(
    query: string,
    variables?: Record<string, unknown>,
    token?: string,
  ): Promise<GraphQLResponse<T>> {
    const response = await app.inject({
      method: 'POST',
      url: '/graphql',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      payload: { query, variables },
    });
    return JSON.parse(response.body) as GraphQLResponse<T>;
  }

  const TEST_PASSWORD = 'password123';

  /** Registers step 1 (with a password) and logs in, returning the new
   * account's id plus a valid session token — the token every authenticated
   * operation (punch, history, export, re-enroll, delete) now needs. */
  async function registerAndLogin(
    fullName: string,
    email: string,
  ): Promise<{ userId: string; token: string }> {
    const step1 = await graphql<{ registerStep1: { id: string } }>(
      'mutation($fullName:String!,$email:String!,$password:String!){ registerStep1(fullName:$fullName,email:$email,password:$password){ id } }',
      { fullName, email, password: TEST_PASSWORD },
    );
    const userId = step1.data?.registerStep1.id as string;
    const login = await graphql<{ login: { token: string } }>(
      'mutation($email:String!,$password:String!){ login(email:$email,password:$password){ token } }',
      { email, password: TEST_PASSWORD },
    );
    return { userId, token: login.data?.login.token as string };
  }

  async function enrollFingerprint(userId: string): Promise<void> {
    await graphql(
      'mutation($userId:ID!,$fp:Boolean!){ registerStep2(userId:$userId,fingerprintConfirmed:$fp){ registrationStep } }',
      { userId, fp: true },
    );
  }

  async function enrollFace(userId: string, embedding: number[]): Promise<void> {
    await graphql(
      'mutation($userId:ID!,$e:FaceEmbeddingsInput!){ registerStep3(userId:$userId,embeddings:$e){ registrationStep } }',
      { userId, e: { left: embedding, right: embedding, frontal: embedding } },
    );
  }

  it('rejects registration with a too-short password', async () => {
    const result = await graphql(
      'mutation($fullName:String!,$email:String!,$password:String!){ registerStep1(fullName:$fullName,email:$email,password:$password){ id } }',
      { fullName: 'Shorty', email: 'shorty@example.com', password: 'short' },
    );
    expect(result.errors?.[0]?.message).toMatch(/at least 8/i);
  });

  it('login rejects a wrong password and an unknown email with the same generic error', async () => {
    await registerAndLogin('Login User', 'login.user@example.com');

    const wrongPassword = await graphql(
      'mutation($email:String!,$password:String!){ login(email:$email,password:$password){ token } }',
      { email: 'login.user@example.com', password: 'not-the-password' },
    );
    expect(wrongPassword.errors?.[0]?.message).toMatch(/invalid email or password/i);

    const unknownEmail = await graphql(
      'mutation($email:String!,$password:String!){ login(email:$email,password:$password){ token } }',
      { email: 'nobody@example.com', password: TEST_PASSWORD },
    );
    expect(unknownEmail.errors?.[0]?.message).toMatch(/invalid email or password/i);
  });

  it('rejects a punch with no session token (must log in first)', async () => {
    const { userId } = await registerAndLogin('No Token', 'no.token@example.com');
    await enrollFingerprint(userId);

    const punch = await graphql(
      'mutation($userId:ID!){ punchInFingerprint(userId:$userId){ token } }',
      { userId },
    );
    expect(punch.errors?.[0]?.message).toMatch(/log in/i);
  });

  it('completes register -> login -> punch-in -> history -> export', async () => {
    const { userId, token } = await registerAndLogin('Integration Test', 'integration@example.com');
    await enrollFingerprint(userId);

    const identify = await graphql<{
      identify: { userId: string; fingerprintEnrolled: boolean; faceEnrolled: boolean };
    }>(
      'query($email:String!){ identify(email:$email){ userId fingerprintEnrolled faceEnrolled } }',
      {
        email: 'integration@example.com',
      },
    );
    expect(identify.data?.identify.fingerprintEnrolled).toBe(true);
    expect(identify.data?.identify.faceEnrolled).toBe(false);

    const checkIn = await graphql<{ punchInFingerprint: { type: string } }>(
      'mutation($userId:ID!){ punchInFingerprint(userId:$userId){ type } }',
      { userId },
      token,
    );
    expect(checkIn.data?.punchInFingerprint.type).toBe('CHECK_IN');

    const checkOut = await graphql<{ punchInFingerprint: { type: string } }>(
      'mutation($userId:ID!){ punchInFingerprint(userId:$userId){ type } }',
      { userId },
      token,
    );
    expect(checkOut.data?.punchInFingerprint.type).toBe('CHECK_OUT');

    const duplicate = await graphql(
      'mutation($userId:ID!){ punchInFingerprint(userId:$userId){ type } }',
      { userId },
      token,
    );
    expect(duplicate.errors?.[0]?.message).toMatch(/already checked out/i);

    const historyNoAuth = await graphql('{ attendanceHistory { date } }');
    expect(historyNoAuth.errors?.[0]?.message).toMatch(/unauthorized/i);

    const history = await graphql<{ attendanceHistory: { date: string; status: string }[] }>(
      '{ attendanceHistory { date status } }',
      undefined,
      token,
    );
    expect(history.data?.attendanceHistory).toHaveLength(1);
    // Check-in and check-out both happen back-to-back in this test, so hours
    // worked is ~0 — well under the full-day threshold, hence PARTIAL_DAY.
    expect(history.data?.attendanceHistory[0]?.status).toBe('PARTIAL_DAY');

    const csvResponse = await app.inject({
      method: 'GET',
      url: '/export/attendance.csv',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(csvResponse.statusCode).toBe(200);
    expect(csvResponse.headers['content-type']).toContain('text/csv');
    const [csvHeader, csvRow] = csvResponse.body.split('\n');
    expect(csvHeader).toContain('Work Hours');
    expect(csvHeader).toContain('Attendance Status');
    expect(csvRow).toContain('Partial day');
    expect(csvResponse.headers['content-disposition']).toContain('_Attendance.csv');
  });

  it('completes a face punch-in when the live embedding matches an enrolled one', async () => {
    const { userId, token } = await registerAndLogin('Face User', 'face.match@example.com');

    // A trivial 3-d embedding is enough to exercise the real cosine-similarity
    // match logic (packages/face-matching) end-to-end.
    const enrolledEmbedding = [1, 0, 0];
    await enrollFace(userId, enrolledEmbedding);

    const liveEmbedding = [1, 0, 0];
    const punch = await graphql<{
      punchInFace: { type: string; matched: boolean; bestScore: number };
    }>(
      'mutation($userId:ID!,$emb:[Float!]!){ punchInFace(userId:$userId,embedding:$emb){ type matched bestScore } }',
      { userId, emb: liveEmbedding },
      token,
    );
    expect(punch.data?.punchInFace.matched).toBe(true);
    expect(punch.data?.punchInFace.bestScore).toBeCloseTo(1.0);
    expect(punch.data?.punchInFace.type).toBe('CHECK_IN');

    const attempts = await prisma.verificationAttempt.findMany({ where: { userId } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.outcome).toBe('SUCCESS');
    expect(attempts[0]?.method).toBe('FACE');
  });

  it('rejects a face punch-in when the live embedding does not match', async () => {
    const { userId, token } = await registerAndLogin('Face Mismatch', 'face.mismatch@example.com');
    await enrollFace(userId, [1, 0, 0]);

    // Orthogonal to the enrolled embedding — cosine similarity 0, well under MATCH_THRESHOLD.
    const unmatchedEmbedding = [0, 1, 0];
    const punch = await graphql(
      'mutation($userId:ID!,$emb:[Float!]!){ punchInFace(userId:$userId,embedding:$emb){ token } }',
      { userId, emb: unmatchedEmbedding },
      token,
    );
    expect(punch.errors?.[0]?.message).toMatch(/did not match/i);

    const attempts = await prisma.verificationAttempt.findMany({ where: { userId } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.outcome).toBe('FAILURE');
    expect(attempts[0]?.method).toBe('FACE');
    expect(attempts[0]?.matchScore).toBeCloseTo(0);

    const records = await prisma.attendanceRecord.findMany({ where: { userId } });
    expect(records).toHaveLength(0);
  });

  it('re-enrolling face supersedes the old embedding so it no longer matches at punch-in', async () => {
    const { userId, token } = await registerAndLogin(
      'Re-enroll Face',
      're-enroll.face@example.com',
    );
    await enrollFingerprint(userId);
    const oldEmbedding = [1, 0, 0];
    await enrollFace(userId, oldEmbedding);

    const noAuth = await graphql(
      'mutation($e:FaceEmbeddingsInput!){ reEnrollFace(embeddings:$e){ faceEnrolled } }',
      { e: { left: oldEmbedding, right: oldEmbedding, frontal: oldEmbedding } },
    );
    expect(noAuth.errors?.[0]?.message).toMatch(/unauthorized/i);

    const newEmbedding = [0, 1, 0];
    const reEnroll = await graphql<{ reEnrollFace: { faceEnrolled: boolean } }>(
      'mutation($e:FaceEmbeddingsInput!){ reEnrollFace(embeddings:$e){ faceEnrolled } }',
      { e: { left: newEmbedding, right: newEmbedding, frontal: newEmbedding } },
      token,
    );
    expect(reEnroll.data?.reEnrollFace.faceEnrolled).toBe(true);

    // The old (now-superseded) embedding must never match again.
    const oldPunch = await graphql(
      'mutation($userId:ID!,$emb:[Float!]!){ punchInFace(userId:$userId,embedding:$emb){ token } }',
      { userId, emb: oldEmbedding },
      token,
    );
    expect(oldPunch.errors?.[0]?.message).toMatch(/did not match/i);

    // The new embedding matches.
    const newPunch = await graphql<{ punchInFace: { matched: boolean } }>(
      'mutation($userId:ID!,$emb:[Float!]!){ punchInFace(userId:$userId,embedding:$emb){ matched } }',
      { userId, emb: newEmbedding },
      token,
    );
    expect(newPunch.data?.punchInFace.matched).toBe(true);

    const faceRows = await prisma.biometricEnrollment.findMany({
      where: { userId, type: { in: ['FACE_LEFT', 'FACE_RIGHT', 'FACE_FRONTAL'] } },
    });
    expect(faceRows).toHaveLength(6);
    expect(faceRows.filter((row) => row.supersededAt === null)).toHaveLength(3);
    expect(faceRows.filter((row) => row.supersededAt !== null)).toHaveLength(3);
  });

  it('re-enrolling fingerprint supersedes the old row while staying enrolled', async () => {
    const { userId, token } = await registerAndLogin(
      'Re-enroll Fingerprint',
      're-enroll.fingerprint@example.com',
    );
    await enrollFingerprint(userId);

    const noAuth = await graphql('mutation{ reEnrollFingerprint{ fingerprintEnrolled } }');
    expect(noAuth.errors?.[0]?.message).toMatch(/unauthorized/i);

    const reEnroll = await graphql<{ reEnrollFingerprint: { fingerprintEnrolled: boolean } }>(
      'mutation{ reEnrollFingerprint{ fingerprintEnrolled } }',
      undefined,
      token,
    );
    expect(reEnroll.data?.reEnrollFingerprint.fingerprintEnrolled).toBe(true);

    const rows = await prisma.biometricEnrollment.findMany({
      where: { userId, type: 'FINGERPRINT_FLAG' },
    });
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.supersededAt === null)).toHaveLength(1);
    expect(rows.filter((row) => row.supersededAt !== null)).toHaveLength(1);
  });

  it('logs a FAILURE verification attempt when face is not enrolled', async () => {
    const { userId, token } = await registerAndLogin('No Face', 'no.face@example.com');

    const punch = await graphql(
      'mutation($userId:ID!,$emb:[Float!]!){ punchInFace(userId:$userId,embedding:$emb){ token } }',
      { userId, emb: [1, 0, 0] },
      token,
    );
    expect(punch.errors?.[0]?.message).toMatch(/not enrolled/i);

    const attempts = await prisma.verificationAttempt.findMany({ where: { userId } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.outcome).toBe('FAILURE');
  });

  it('serves the authenticated profile via `me`, rejecting unauthenticated access', async () => {
    const { userId, token } = await registerAndLogin('Profile User', 'profile.user@example.com');
    await enrollFingerprint(userId);

    const noAuth = await graphql('{ me { email } }');
    expect(noAuth.errors?.[0]?.message).toMatch(/unauthorized/i);

    const profile = await graphql<{
      me: {
        fullName: string;
        email: string;
        createdAt: string;
        enrollmentStatus: { faceEnrolled: boolean; fingerprintEnrolled: boolean };
      };
    }>(
      '{ me { fullName email createdAt enrollmentStatus { faceEnrolled fingerprintEnrolled } } }',
      undefined,
      token,
    );
    expect(profile.data?.me.fullName).toBe('Profile User');
    expect(profile.data?.me.email).toBe('profile.user@example.com');
    expect(profile.data?.me.createdAt).toBeTruthy();
    expect(profile.data?.me.enrollmentStatus.fingerprintEnrolled).toBe(true);
    expect(profile.data?.me.enrollmentStatus.faceEnrolled).toBe(false);
  });

  it('serves `myVerificationAttempts` most-recent-first, rejecting unauthenticated access', async () => {
    const { userId, token } = await registerAndLogin(
      'Verification Activity',
      'verification.activity@example.com',
    );
    await enrollFingerprint(userId);

    // A SUCCESS attempt (fingerprint enrolled) followed by a FAILURE attempt
    // (face never enrolled) — in that order, so most-recent-first ordering
    // is actually exercised.
    await graphql(
      'mutation($userId:ID!){ punchInFingerprint(userId:$userId){ token } }',
      { userId },
      token,
    );
    await graphql(
      'mutation($userId:ID!,$emb:[Float!]!){ punchInFace(userId:$userId,embedding:$emb){ token } }',
      { userId, emb: [1, 0, 0] },
      token,
    );

    const noAuth = await graphql('{ myVerificationAttempts { method } }');
    expect(noAuth.errors?.[0]?.message).toMatch(/unauthorized/i);

    const attempts = await graphql<{
      myVerificationAttempts: { method: string; outcome: string; matchScore: number | null }[];
    }>('{ myVerificationAttempts { method outcome matchScore } }', undefined, token);

    expect(attempts.data?.myVerificationAttempts).toHaveLength(2);
    expect(attempts.data?.myVerificationAttempts[0]).toMatchObject({
      method: 'FACE',
      outcome: 'FAILURE',
    });
    expect(attempts.data?.myVerificationAttempts[1]).toMatchObject({
      method: 'FINGERPRINT',
      outcome: 'SUCCESS',
    });
  });

  it('serves `exportMyData` with profile, enrollment metadata (no embeddings), attendance, and attempts', async () => {
    const { userId, token } = await registerAndLogin('Export User', 'export.user@example.com');
    await enrollFingerprint(userId);
    await enrollFace(userId, [1, 0, 0]);
    await graphql(
      'mutation($userId:ID!){ punchInFingerprint(userId:$userId){ token } }',
      { userId },
      token,
    );

    const noAuth = await graphql('{ exportMyData { profile { email } } }');
    expect(noAuth.errors?.[0]?.message).toMatch(/unauthorized/i);

    const query = `{
      exportMyData {
        profile { fullName email }
        enrollments { type createdAt supersededAt }
        attendanceRecords { type method }
        verificationAttempts { method outcome }
      }
    }`;
    const result = await graphql<{
      exportMyData: {
        profile: { fullName: string; email: string };
        enrollments: { type: string; createdAt: string; supersededAt: string | null }[];
        attendanceRecords: { type: string; method: string }[];
        verificationAttempts: { method: string; outcome: string }[];
      };
    }>(query, undefined, token);

    expect(result.errors).toBeUndefined();
    expect(result.data?.exportMyData.profile).toMatchObject({
      fullName: 'Export User',
      email: 'export.user@example.com',
    });
    // 3 face rows (left/right/frontal) + 1 fingerprint row, none superseded.
    expect(result.data?.exportMyData.enrollments).toHaveLength(4);
    for (const enrollment of result.data?.exportMyData.enrollments ?? []) {
      expect(enrollment.supersededAt).toBeNull();
      // The metadata-only shape must never expose the raw embedding.
      expect(JSON.stringify(enrollment)).not.toContain('embedding');
    }
    expect(result.data?.exportMyData.attendanceRecords).toHaveLength(1);
    expect(result.data?.exportMyData.verificationAttempts).toHaveLength(1);
    expect(result.data?.exportMyData.verificationAttempts[0]).toMatchObject({
      method: 'FINGERPRINT',
      outcome: 'SUCCESS',
    });
  });

  it('deletes the account and cascades to enrollments, attendance, and attempts', async () => {
    const { userId, token } = await registerAndLogin('Delete Me', 'delete.me@example.com');
    await enrollFingerprint(userId);
    await enrollFace(userId, [1, 0, 0]);
    await graphql(
      'mutation($userId:ID!){ punchInFingerprint(userId:$userId){ token } }',
      { userId },
      token,
    );

    const noAuth = await graphql('mutation{ deleteMyAccount }');
    expect(noAuth.errors?.[0]?.message).toMatch(/unauthorized/i);

    // Sanity check: real child rows exist across all three cascaded relations
    // before deletion, so the assertions below prove the cascade removed
    // something, not that the tables started empty.
    expect(await prisma.biometricEnrollment.count({ where: { userId } })).toBe(4);
    expect(await prisma.attendanceRecord.count({ where: { userId } })).toBe(1);
    expect(await prisma.verificationAttempt.count({ where: { userId } })).toBe(1);

    const deletion = await graphql<{ deleteMyAccount: boolean }>(
      'mutation{ deleteMyAccount }',
      undefined,
      token,
    );
    expect(deletion.data?.deleteMyAccount).toBe(true);

    expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull();
    expect(await prisma.biometricEnrollment.count({ where: { userId } })).toBe(0);
    expect(await prisma.attendanceRecord.count({ where: { userId } })).toBe(0);
    expect(await prisma.verificationAttempt.count({ where: { userId } })).toBe(0);
  });

  it('logs a FAILURE verification attempt when fingerprint is not enrolled', async () => {
    const { userId, token } = await registerAndLogin(
      'No Fingerprint',
      'no.fingerprint@example.com',
    );

    const punch = await graphql(
      'mutation($userId:ID!){ punchInFingerprint(userId:$userId){ token } }',
      { userId },
      token,
    );
    expect(punch.errors?.[0]?.message).toMatch(/not enrolled/i);

    const attempts = await prisma.verificationAttempt.findMany({ where: { userId } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.outcome).toBe('FAILURE');
  });
});
