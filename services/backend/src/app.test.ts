/**
 * Integration test for the full happy path — register -> identify ->
 * punch-in -> history -> CSV export — exercised through the real GraphQL
 * schema and the one plain HTTP route, via Fastify's own `app.inject()`
 * (ADR-010, no supertest) against a real (isolated) SQLite database, not
 * mocks (coding-standards.md).
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

  it('completes register -> identify -> punch-in -> history -> export', async () => {
    const step1 = await graphql<{ registerStep1: { id: string; registrationStep: number } }>(
      'mutation($fullName:String!,$email:String!){ registerStep1(fullName:$fullName,email:$email){ id registrationStep } }',
      { fullName: 'Integration Test', email: 'integration@example.com' },
    );
    expect(step1.data?.registerStep1.registrationStep).toBe(1);
    const userId = step1.data?.registerStep1.id;

    const step2 = await graphql<{ registerStep2: { registrationStep: number } }>(
      'mutation($userId:ID!,$fp:Boolean!){ registerStep2(userId:$userId,fingerprintConfirmed:$fp){ registrationStep } }',
      { userId, fp: true },
    );
    expect(step2.data?.registerStep2.registrationStep).toBe(2);

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

    const checkIn = await graphql<{ punchInFingerprint: { token: string; type: string } }>(
      'mutation($userId:ID!){ punchInFingerprint(userId:$userId){ token type } }',
      { userId },
    );
    expect(checkIn.data?.punchInFingerprint.type).toBe('CHECK_IN');
    const token = checkIn.data?.punchInFingerprint.token;

    const checkOut = await graphql<{ punchInFingerprint: { type: string } }>(
      'mutation($userId:ID!){ punchInFingerprint(userId:$userId){ type } }',
      { userId },
    );
    expect(checkOut.data?.punchInFingerprint.type).toBe('CHECK_OUT');

    const duplicate = await graphql(
      'mutation($userId:ID!){ punchInFingerprint(userId:$userId){ type } }',
      { userId },
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
    expect(history.data?.attendanceHistory[0]?.status).not.toBe('INCOMPLETE');

    const csvResponse = await app.inject({
      method: 'GET',
      url: '/export/attendance.csv',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(csvResponse.statusCode).toBe(200);
    expect(csvResponse.headers['content-type']).toContain('text/csv');
    expect(csvResponse.body).toContain('CHECK_IN');
    expect(csvResponse.body).toContain('CHECK_OUT');
  });

  it('completes a face punch-in when the live embedding matches an enrolled one', async () => {
    const step1 = await graphql<{ registerStep1: { id: string } }>(
      'mutation($fullName:String!,$email:String!){ registerStep1(fullName:$fullName,email:$email){ id } }',
      { fullName: 'Face User', email: 'face.match@example.com' },
    );
    const userId = step1.data?.registerStep1.id;

    // A trivial 3-d embedding is enough to exercise the real cosine-similarity
    // match logic (packages/face-matching) end-to-end — the point of this
    // test is the resolver's wiring, not MobileFaceNet's actual output shape.
    const enrolledEmbedding = [1, 0, 0];
    await graphql(
      'mutation($userId:ID!,$e:FaceEmbeddingsInput!){ registerStep3(userId:$userId,embeddings:$e){ registrationStep } }',
      {
        userId,
        e: { left: enrolledEmbedding, right: enrolledEmbedding, frontal: enrolledEmbedding },
      },
    );

    const liveEmbedding = [1, 0, 0];
    const punch = await graphql<{
      punchInFace: { type: string; matched: boolean; bestScore: number };
    }>(
      'mutation($userId:ID!,$emb:[Float!]!){ punchInFace(userId:$userId,embedding:$emb){ type matched bestScore } }',
      { userId, emb: liveEmbedding },
    );
    expect(punch.data?.punchInFace.matched).toBe(true);
    expect(punch.data?.punchInFace.bestScore).toBeCloseTo(1.0);
    expect(punch.data?.punchInFace.type).toBe('CHECK_IN');

    const attempts = await prisma.verificationAttempt.findMany({
      where: { userId: userId as string },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.outcome).toBe('SUCCESS');
    expect(attempts[0]?.method).toBe('FACE');
  });

  it('rejects a face punch-in when the live embedding does not match', async () => {
    const step1 = await graphql<{ registerStep1: { id: string } }>(
      'mutation($fullName:String!,$email:String!){ registerStep1(fullName:$fullName,email:$email){ id } }',
      { fullName: 'Face Mismatch', email: 'face.mismatch@example.com' },
    );
    const userId = step1.data?.registerStep1.id;

    const enrolledEmbedding = [1, 0, 0];
    await graphql(
      'mutation($userId:ID!,$e:FaceEmbeddingsInput!){ registerStep3(userId:$userId,embeddings:$e){ registrationStep } }',
      {
        userId,
        e: { left: enrolledEmbedding, right: enrolledEmbedding, frontal: enrolledEmbedding },
      },
    );

    // Orthogonal to the enrolled embedding — cosine similarity 0, well under MATCH_THRESHOLD.
    const unmatchedEmbedding = [0, 1, 0];
    const punch = await graphql(
      'mutation($userId:ID!,$emb:[Float!]!){ punchInFace(userId:$userId,embedding:$emb){ token } }',
      { userId, emb: unmatchedEmbedding },
    );
    expect(punch.errors?.[0]?.message).toMatch(/did not match/i);

    const attempts = await prisma.verificationAttempt.findMany({
      where: { userId: userId as string },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.outcome).toBe('FAILURE');
    expect(attempts[0]?.method).toBe('FACE');
    expect(attempts[0]?.matchScore).toBeCloseTo(0);

    const records = await prisma.attendanceRecord.findMany({ where: { userId: userId as string } });
    expect(records).toHaveLength(0);
  });

  it('logs a FAILURE verification attempt when face is not enrolled', async () => {
    const step1 = await graphql<{ registerStep1: { id: string } }>(
      'mutation($fullName:String!,$email:String!){ registerStep1(fullName:$fullName,email:$email){ id } }',
      { fullName: 'No Face', email: 'no.face@example.com' },
    );
    const userId = step1.data?.registerStep1.id;

    const punch = await graphql(
      'mutation($userId:ID!,$emb:[Float!]!){ punchInFace(userId:$userId,embedding:$emb){ token } }',
      { userId, emb: [1, 0, 0] },
    );
    expect(punch.errors?.[0]?.message).toMatch(/not enrolled/i);

    const attempts = await prisma.verificationAttempt.findMany({
      where: { userId: userId as string },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.outcome).toBe('FAILURE');
  });

  it('serves the authenticated profile via `me`, rejecting unauthenticated access', async () => {
    const step1 = await graphql<{ registerStep1: { id: string } }>(
      'mutation($fullName:String!,$email:String!){ registerStep1(fullName:$fullName,email:$email){ id } }',
      { fullName: 'Profile User', email: 'profile.user@example.com' },
    );
    const userId = step1.data?.registerStep1.id;

    await graphql(
      'mutation($userId:ID!,$fp:Boolean!){ registerStep2(userId:$userId,fingerprintConfirmed:$fp){ registrationStep } }',
      { userId, fp: true },
    );

    const noAuth = await graphql('{ me { email } }');
    expect(noAuth.errors?.[0]?.message).toMatch(/unauthorized/i);

    const checkIn = await graphql<{ punchInFingerprint: { token: string } }>(
      'mutation($userId:ID!){ punchInFingerprint(userId:$userId){ token } }',
      { userId },
    );
    const token = checkIn.data?.punchInFingerprint.token;

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

  it('logs a FAILURE verification attempt when fingerprint is not enrolled', async () => {
    const step1 = await graphql<{ registerStep1: { id: string } }>(
      'mutation($fullName:String!,$email:String!){ registerStep1(fullName:$fullName,email:$email){ id } }',
      { fullName: 'No Fingerprint', email: 'no.fingerprint@example.com' },
    );
    const userId = step1.data?.registerStep1.id;
    expect(userId).toBeDefined();

    const punch = await graphql(
      'mutation($userId:ID!){ punchInFingerprint(userId:$userId){ token } }',
      { userId },
    );
    expect(punch.errors?.[0]?.message).toMatch(/not enrolled/i);

    const attempts = await prisma.verificationAttempt.findMany({
      where: { userId: userId as string },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.outcome).toBe('FAILURE');
  });
});
