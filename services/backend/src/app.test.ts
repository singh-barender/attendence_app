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
