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
import { revokeToken } from './services/tokenService';

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

  /** Registers step 1 (with a password) — which now issues a session token
   * immediately (architecture-review-2026-07-16.md's F2b) — and returns the
   * new account's id plus that token. Still calls `login` too, only to keep
   * exercising that path in every test that uses this helper; the returned
   * token is registerStep1's own. */
  async function registerAndLogin(
    fullName: string,
    email: string,
  ): Promise<{ userId: string; token: string }> {
    const step1 = await graphql<{ registerStep1: { token: string; user: { id: string } } }>(
      'mutation($fullName:String!,$email:String!,$password:String!){ registerStep1(fullName:$fullName,email:$email,password:$password){ token user { id } } }',
      { fullName, email, password: TEST_PASSWORD },
    );
    const userId = step1.data?.registerStep1.user.id as string;
    await graphql<{ login: { token: string } }>(
      'mutation($email:String!,$password:String!){ login(email:$email,password:$password){ token } }',
      { email, password: TEST_PASSWORD },
    );
    return { userId, token: step1.data?.registerStep1.token as string };
  }

  async function confirmStepUp(token: string): Promise<string> {
    const result = await graphql<{ confirmStepUp: { stepUpToken: string } }>(
      'mutation($password:String!){ confirmStepUp(password:$password){ stepUpToken } }',
      { password: TEST_PASSWORD },
      token,
    );
    return result.data?.confirmStepUp.stepUpToken as string;
  }

  /** registerStep2/registerStep3 derive the account from the session token
   * (architecture-review-2026-07-16.md's F2b) — no userId argument exists
   * to pass anymore, so these helpers take the caller's token instead. */
  async function enrollFingerprint(token: string): Promise<void> {
    await graphql(
      'mutation($fp:Boolean!){ registerStep2(fingerprintConfirmed:$fp){ registrationStep } }',
      { fp: true },
      token,
    );
  }

  /** MOBILEFACENET_128 for every test — matches this suite's plain trivial
   * embeddings, which don't correspond to any real model's output; only
   * the *tag* matters for exercising the same-model filter
   * (architecture-review-2026-07-16.md's F3), not real embedding fidelity. */
  const TEST_EMBEDDING_MODEL = 'MOBILEFACENET_128';

  /** Fixed, multi-axis deltas for `nudged` below — deliberately NOT a nudge
   * to a single component, which is a no-op in cosine terms whenever that
   * happens to be a test vector's only nonzero component (e.g. nudging
   * index 1 of `[0, 1, 0]` just scales the vector — still a pure scalar
   * multiple, cosine exactly 1.0, the literal bug this file's tests are
   * meant to exercise around). Spreading the delta across every axis
   * changes direction regardless of which components the source vector
   * happens to have zeroed. */
  const LEFT_NUDGE = [0.1, -0.15, 0.05];
  const RIGHT_NUDGE = [-0.05, 0.1, -0.15];

  /** Perturbs a trivial test embedding just enough to clear
   * `MAX_ENROLLMENT_SIMILARITY` (not a literal duplicate) while staying
   * nowhere near `MIN_ENROLLMENT_CONSISTENCY` (still plausibly the same
   * person) — lets `enrollFace` below submit three angles that aren't
   * identical without needing real model output. */
  function nudged(embedding: number[], delta: number[]): number[] {
    return embedding.map((value, index) => value + (delta[index] ?? 0));
  }

  /** `frontal` is always the exact, unperturbed `embedding` passed in — every
   * test asserting an exact/near-1.0 match score at punch-in relies on this
   * (isMatch takes the best score across all active embeddings, so a later
   * punch with this same `embedding` still scores against `frontal`
   * unchanged). `left`/`right` are nudged copies, not literal duplicates —
   * post-follow-up-review-review, `assertEnrollmentConsistency` now rejects
   * three identical angles (the exact "single photo submitted three times"
   * gap that finding closed). */
  async function enrollFace(token: string, embedding: number[]): Promise<void> {
    await graphql(
      'mutation($e:FaceEmbeddingsInput!,$m:EmbeddingModel!){ registerStep3(embeddings:$e,embeddingModel:$m){ registrationStep } }',
      {
        e: {
          left: nudged(embedding, LEFT_NUDGE),
          right: nudged(embedding, RIGHT_NUDGE),
          frontal: embedding,
        },
        m: TEST_EMBEDDING_MODEL,
      },
      token,
    );
  }

  /** A genuine open→closed→open eye-probability sequence — passes
   * `detectBlink`'s real decision logic, not a stub. Every `punchInFace`
   * call now requires the server to independently re-verify liveness
   * (architecture-review-2026-07-16.md's F1), so every test exercising
   * match/mismatch logic needs a real passing sample set, not just an
   * embedding. */
  const VALID_LIVENESS_SAMPLES = [
    { timestampMs: 0, leftEyeOpenProbability: 0.9, rightEyeOpenProbability: 0.9 },
    { timestampMs: 100, leftEyeOpenProbability: 0.1, rightEyeOpenProbability: 0.1 },
    { timestampMs: 200, leftEyeOpenProbability: 0.9, rightEyeOpenProbability: 0.9 },
  ];

  async function punchInFace<T = Record<string, unknown>>(
    token: string,
    userId: string,
    embedding: number[],
    selection: string,
  ): Promise<GraphQLResponse<T>> {
    return graphql<T>(
      `mutation($userId:ID!,$emb:[Float!]!,$m:EmbeddingModel!,$type:LivenessChallengeType!,$samples:[LivenessSampleInput!]!){ punchInFace(userId:$userId,embedding:$emb,embeddingModel:$m,livenessChallengeType:$type,livenessSamples:$samples){ ${selection} } }`,
      {
        userId,
        emb: embedding,
        m: TEST_EMBEDDING_MODEL,
        type: 'BLINK',
        samples: VALID_LIVENESS_SAMPLES,
      },
      token,
    );
  }

  it('rejects registration with a too-short password', async () => {
    const result = await graphql(
      'mutation($fullName:String!,$email:String!,$password:String!){ registerStep1(fullName:$fullName,email:$email,password:$password){ token } }',
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
    const { userId, token } = await registerAndLogin('No Token', 'no.token@example.com');
    await enrollFingerprint(token);

    const punch = await graphql(
      'mutation($userId:ID!){ punchInFingerprint(userId:$userId){ type } }',
      { userId },
    );
    expect(punch.errors?.[0]?.message).toMatch(/log in/i);
  });

  it('completes register -> login -> punch-in -> history -> export', async () => {
    const { userId, token } = await registerAndLogin('Integration Test', 'integration@example.com');
    await enrollFingerprint(token);

    // Enrollment status is read via the authenticated `me` query — the
    // public `identify` query was removed entirely (architecture-review
    // -2026-07-16.md's F9): once registerStep1 issues a session token
    // immediately (F2b), no legitimate flow was left that needed an
    // unauthenticated email-based lookup.
    const profile = await graphql<{
      me: { enrollmentStatus: { fingerprintEnrolled: boolean; faceEnrolled: boolean } };
    }>('{ me { enrollmentStatus { fingerprintEnrolled faceEnrolled } } }', undefined, token);
    expect(profile.data?.me.enrollmentStatus.fingerprintEnrolled).toBe(true);
    expect(profile.data?.me.enrollmentStatus.faceEnrolled).toBe(false);

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

  it('replaying a punch with the same idempotency key returns the original record, not a re-inferred one (F7)', async () => {
    const { userId, token } = await registerAndLogin('Idempotent', 'idempotent@example.com');
    await enrollFingerprint(token);

    const realKey = 'test-idempotency-key-1';
    const checkIn = await graphql<{ punchInFingerprint: { type: string; record: { id: string } } }>(
      'mutation($userId:ID!,$k:String!){ punchInFingerprint(userId:$userId,idempotencyKey:$k){ type record { id } } }',
      { userId, k: realKey },
      token,
    );
    expect(checkIn.data?.punchInFingerprint.type).toBe('CHECK_IN');
    const originalRecordId = checkIn.data?.punchInFingerprint.record.id;

    // Replaying the SAME key must return the original CHECK_IN record, not
    // re-infer CHECK_OUT against now-changed state — this is the exact
    // "response lost, client retries" scenario F7 closes.
    const replay = await graphql<{ punchInFingerprint: { type: string; record: { id: string } } }>(
      'mutation($userId:ID!,$k:String!){ punchInFingerprint(userId:$userId,idempotencyKey:$k){ type record { id } } }',
      { userId, k: realKey },
      token,
    );
    expect(replay.data?.punchInFingerprint.type).toBe('CHECK_IN');
    expect(replay.data?.punchInFingerprint.record.id).toBe(originalRecordId);

    // Confirms the replay didn't actually write a second row.
    const records = await prisma.attendanceRecord.findMany({ where: { userId } });
    expect(records).toHaveLength(1);

    // A genuinely new attempt (fresh key) still works normally as a real
    // CHECK_OUT.
    const checkOut = await graphql<{ punchInFingerprint: { type: string } }>(
      'mutation($userId:ID!,$k:String!){ punchInFingerprint(userId:$userId,idempotencyKey:$k){ type } }',
      { userId, k: 'test-idempotency-key-2' },
      token,
    );
    expect(checkOut.data?.punchInFingerprint.type).toBe('CHECK_OUT');
  });

  it("rejects an idempotency key that belongs to another user's punch (F7 follow-up review)", async () => {
    const owner = await registerAndLogin('Key Owner', 'key-owner@example.com');
    await enrollFingerprint(owner.token);
    const attacker = await registerAndLogin('Key Guesser', 'key-guesser@example.com');
    await enrollFingerprint(attacker.token);

    const sharedKey = 'guessed-or-intercepted-key';
    const ownersPunch = await graphql<{ punchInFingerprint: { record: { id: string } } }>(
      'mutation($userId:ID!,$k:String!){ punchInFingerprint(userId:$userId,idempotencyKey:$k){ record { id } } }',
      { userId: owner.userId, k: sharedKey },
      owner.token,
    );
    const ownersRecordId = ownersPunch.data?.punchInFingerprint.record.id;
    expect(ownersRecordId).toBeTruthy();

    // The attacker authenticates and verifies as *themself* (their own
    // session, their own enrolled fingerprint) but reuses the owner's key —
    // the server must reject outright, never hand back the owner's record.
    const attackersAttempt = await graphql(
      'mutation($userId:ID!,$k:String!){ punchInFingerprint(userId:$userId,idempotencyKey:$k){ record { id } } }',
      { userId: attacker.userId, k: sharedKey },
      attacker.token,
    );
    expect(attackersAttempt.errors?.[0]?.message).toMatch(/invalid idempotency key/i);

    // No row was ever written for the attacker under that key, and the
    // owner's original record is untouched.
    const attackerRecords = await prisma.attendanceRecord.findMany({
      where: { userId: attacker.userId },
    });
    expect(attackerRecords).toHaveLength(0);
    const ownerRecords = await prisma.attendanceRecord.findMany({
      where: { userId: owner.userId },
    });
    expect(ownerRecords).toHaveLength(1);
    expect(ownerRecords[0]?.id).toBe(ownersRecordId);
  });

  it('buckets an offline-resumed punch by the client-claimed day, not the server-received day (offline sync date-drift follow-up review)', async () => {
    const { userId, token } = await registerAndLogin(
      'Midnight Rollover',
      'midnight.rollover@example.com',
    );
    await enrollFingerprint(token);

    // Simulates a punch made yesterday evening that only actually reached
    // the server just now (e.g. queued offline, resumed after local
    // midnight) — without the fix, this would be bucketed against *today*
    // and inferred as a fresh CHECK_IN instead of yesterday's CHECK_OUT.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(17, 0, 0, 0);
    const expectedDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    const beforeRequest = new Date();
    const punch = await graphql<{
      punchInFingerprint: { type: string; record: { date: string; timestamp: string } };
    }>(
      'mutation($userId:ID!,$ts:DateTime!){ punchInFingerprint(userId:$userId,clientTimestamp:$ts){ type record { date timestamp } } }',
      { userId, ts: yesterday.toISOString() },
      token,
    );
    expect(punch.data?.punchInFingerprint.type).toBe('CHECK_IN');
    expect(punch.data?.punchInFingerprint.record.date).toBe(expectedDate);
    // The *displayed* timestamp is the resolved (client-claimed) instant —
    // not whenever the server actually received this request — a second
    // follow-up review finding: date-bucketing alone left the stored
    // timestamp (and everything reading it: display, hours-worked,
    // lateness) still wrong.
    expect(new Date(punch.data?.punchInFingerprint.record.timestamp ?? '').getTime()).toBe(
      yesterday.getTime(),
    );

    const records = await prisma.attendanceRecord.findMany({ where: { userId } });
    expect(records).toHaveLength(1);
    expect(records[0]?.date).toBe(expectedDate);
    expect(records[0]?.timestamp.getTime()).toBe(yesterday.getTime());
    // serverReceivedAt (hidden, never exposed via GraphQL) still holds the
    // true receipt instant — the client's claim doesn't erase this fact,
    // it's just no longer what's used for anything user-facing.
    expect(records[0]?.serverReceivedAt.getTime()).toBeGreaterThanOrEqual(beforeRequest.getTime());
  });

  it('computes correct hoursWorked/isLate for a whole offline-batched day synced at once (round-4 follow-up review)', async () => {
    const { userId, token } = await registerAndLogin(
      'Batched Offline Day',
      'batched.offline.day@example.com',
    );
    await enrollFingerprint(token);

    // Both punches are submitted back-to-back (simulating an entire
    // offline-queued day resuming the moment connectivity returns), but
    // their *claimed* times are hours apart — 8am check-in, 5pm check-out.
    // Before this fix, both would land within the same server-received
    // second, giving ~0 hoursWorked and a false isLate.
    const checkInAt = new Date();
    checkInAt.setHours(8, 0, 0, 0);
    const checkOutAt = new Date();
    checkOutAt.setHours(17, 0, 0, 0);
    const todayDate = `${checkInAt.getFullYear()}-${String(checkInAt.getMonth() + 1).padStart(2, '0')}-${String(checkInAt.getDate()).padStart(2, '0')}`;

    await graphql(
      'mutation($userId:ID!,$ts:DateTime!){ punchInFingerprint(userId:$userId,clientTimestamp:$ts){ type } }',
      { userId, ts: checkInAt.toISOString() },
      token,
    );
    await graphql(
      'mutation($userId:ID!,$ts:DateTime!){ punchInFingerprint(userId:$userId,clientTimestamp:$ts){ type } }',
      { userId, ts: checkOutAt.toISOString() },
      token,
    );

    const history = await graphql<{
      attendanceHistory: { date: string; hoursWorked: number | null; isLate: boolean }[];
    }>('{ attendanceHistory { date hoursWorked isLate } }', undefined, token);
    const day = history.data?.attendanceHistory.find((entry) => entry.date === todayDate);
    expect(day?.hoursWorked).toBeCloseTo(9, 1);
    expect(day?.isLate).toBe(false);
  });

  it('ignores a wildly divergent client timestamp and falls back to server-received time', async () => {
    const { userId, token } = await registerAndLogin(
      'Bad Client Clock',
      'bad.client.clock@example.com',
    );
    await enrollFingerprint(token);

    const today = new Date();
    const expectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const wildlyWrongClock = new Date();
    wildlyWrongClock.setFullYear(wildlyWrongClock.getFullYear() + 1);

    const punch = await graphql<{
      punchInFingerprint: { record: { date: string } };
    }>(
      'mutation($userId:ID!,$ts:DateTime!){ punchInFingerprint(userId:$userId,clientTimestamp:$ts){ record { date } } }',
      { userId, ts: wildlyWrongClock.toISOString() },
      token,
    );
    expect(punch.data?.punchInFingerprint.record.date).toBe(expectedDate);
  });

  it('no longer issues a session token from a punch (follow-up review: credential-sprawl finding)', async () => {
    const { userId, token } = await registerAndLogin(
      'No Punch Token',
      'no-punch-token@example.com',
    );
    await enrollFingerprint(token);

    // The field itself must be gone from the schema, not merely unused —
    // selecting it is a GraphQL validation error, proving punches can no
    // longer mint an extra, unrevoked, still-valid session token on top of
    // the one already authorizing the request.
    const attempt = await graphql(
      'mutation($userId:ID!){ punchInFingerprint(userId:$userId){ token } }',
      { userId },
      token,
    );
    expect(attempt.errors?.[0]?.message).toMatch(/cannot query field.*token/i);
  });

  it('completes a face punch-in when the live embedding matches an enrolled one', async () => {
    const { userId, token } = await registerAndLogin('Face User', 'face.match@example.com');

    // A trivial 3-d embedding is enough to exercise the real cosine-similarity
    // match logic (packages/face-matching) end-to-end.
    const enrolledEmbedding = [1, 0, 0];
    await enrollFace(token, enrolledEmbedding);

    const liveEmbedding = [1, 0, 0];
    const punch = await punchInFace<{
      punchInFace: { type: string; matched: boolean; bestScore: number };
    }>(token, userId, liveEmbedding, 'type matched bestScore');
    expect(punch.data?.punchInFace.matched).toBe(true);
    expect(punch.data?.punchInFace.bestScore).toBeCloseTo(1.0);
    expect(punch.data?.punchInFace.type).toBe('CHECK_IN');

    const attempts = await prisma.verificationAttempt.findMany({ where: { userId } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.outcome).toBe('SUCCESS');
    expect(attempts[0]?.method).toBe('FACE');
  });

  it('rejects a face punch-in whose liveness samples never show a completed blink (F1)', async () => {
    const { userId, token } = await registerAndLogin('No Blink', 'no.blink@example.com');
    const embedding = [1, 0, 0];
    await enrollFace(token, embedding);

    // Eyes stay open the whole window — no closed phase, so no completed
    // blink — even though the embedding itself would otherwise match
    // perfectly. This is the exact scenario F1 closes: a live-looking
    // embedding submitted without ever actually completing a liveness
    // challenge (e.g. a replayed/precomputed embedding sent directly
    // against the API) must be rejected before the match check ever runs.
    const result = await graphql(
      'mutation($userId:ID!,$emb:[Float!]!,$m:EmbeddingModel!,$type:LivenessChallengeType!,$samples:[LivenessSampleInput!]!){ punchInFace(userId:$userId,embedding:$emb,embeddingModel:$m,livenessChallengeType:$type,livenessSamples:$samples){ type } }',
      {
        userId,
        emb: embedding,
        m: TEST_EMBEDDING_MODEL,
        type: 'BLINK',
        samples: [
          { timestampMs: 0, leftEyeOpenProbability: 0.9, rightEyeOpenProbability: 0.9 },
          { timestampMs: 100, leftEyeOpenProbability: 0.85, rightEyeOpenProbability: 0.85 },
        ],
      },
      token,
    );
    expect(result.errors?.[0]?.message).toMatch(/liveness/i);

    // Rejected before the match check — no attendance record, and the
    // failed attempt is still audited (ADR-019).
    const attempts = await prisma.verificationAttempt.findMany({ where: { userId } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.outcome).toBe('FAILURE');

    const records = await prisma.attendanceRecord.findMany({ where: { userId } });
    expect(records).toHaveLength(0);
  });

  it('rejects a face punch-in when the live embedding does not match', async () => {
    const { userId, token } = await registerAndLogin('Face Mismatch', 'face.mismatch@example.com');
    await enrollFace(token, [1, 0, 0]);

    // Orthogonal to the enrolled embedding — cosine similarity 0, well under MATCH_THRESHOLD.
    const unmatchedEmbedding = [0, 1, 0];
    const punch = await punchInFace(token, userId, unmatchedEmbedding, 'type');
    expect(punch.errors?.[0]?.message).toMatch(/did not match/i);

    const attempts = await prisma.verificationAttempt.findMany({ where: { userId } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.outcome).toBe('FAILURE');
    expect(attempts[0]?.method).toBe('FACE');
    // Not exactly 0 anymore: `enrollFace` stores three *slightly* different
    // embeddings now (the lazy-enrollment fix below means literal duplicates
    // are rejected), so the best-of-three score against an orthogonal live
    // embedding is a small nonzero value rather than a clean zero — still
    // nowhere near matching.
    expect(attempts[0]?.matchScore).toBeLessThan(0.2);

    const records = await prisma.attendanceRecord.findMany({ where: { userId } });
    expect(records).toHaveLength(0);
  });

  it('re-enrolling face supersedes the old embedding so it no longer matches at punch-in', async () => {
    const { userId, token } = await registerAndLogin(
      'Re-enroll Face',
      're-enroll.face@example.com',
    );
    await enrollFingerprint(token);
    const oldEmbedding = [1, 0, 0];
    await enrollFace(token, oldEmbedding);

    const REENROLL_FACE_MUTATION =
      'mutation($e:FaceEmbeddingsInput!,$m:EmbeddingModel!,$s:String!){ reEnrollFace(embeddings:$e,embeddingModel:$m,stepUpToken:$s){ faceEnrolled } }';

    const noAuth = await graphql(REENROLL_FACE_MUTATION, {
      e: { left: oldEmbedding, right: oldEmbedding, frontal: oldEmbedding },
      m: TEST_EMBEDDING_MODEL,
      s: 'dummy',
    });
    expect(noAuth.errors?.[0]?.message).toMatch(/unauthorized/i);

    // A plain (merely-valid) session token must NOT work as a step-up token
    // — the whole point of F11 is that session validity alone can't
    // authorize replacing biometric enrollment.
    const sessionAsStepUp = await graphql(
      REENROLL_FACE_MUTATION,
      {
        e: { left: oldEmbedding, right: oldEmbedding, frontal: oldEmbedding },
        m: TEST_EMBEDDING_MODEL,
        s: token,
      },
      token,
    );
    expect(sessionAsStepUp.errors?.[0]?.message).toMatch(/step-up/i);

    const stepUpToken = await confirmStepUp(token);
    const newEmbedding = [0, 1, 0];
    const reEnroll = await graphql<{ reEnrollFace: { faceEnrolled: boolean } }>(
      REENROLL_FACE_MUTATION,
      {
        e: {
          left: nudged(newEmbedding, LEFT_NUDGE),
          right: nudged(newEmbedding, RIGHT_NUDGE),
          frontal: newEmbedding,
        },
        m: TEST_EMBEDDING_MODEL,
        s: stepUpToken,
      },
      token,
    );
    expect(reEnroll.data?.reEnrollFace.faceEnrolled).toBe(true);

    // The old (now-superseded) embedding must never match again.
    const oldPunch = await punchInFace(token, userId, oldEmbedding, 'type');
    expect(oldPunch.errors?.[0]?.message).toMatch(/did not match/i);

    // The new embedding matches.
    const newPunch = await punchInFace<{ punchInFace: { matched: boolean } }>(
      token,
      userId,
      newEmbedding,
      'matched',
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
    await enrollFingerprint(token);

    const noAuth = await graphql(
      'mutation($s:String!){ reEnrollFingerprint(stepUpToken:$s){ fingerprintEnrolled } }',
      { s: 'dummy' },
    );
    expect(noAuth.errors?.[0]?.message).toMatch(/unauthorized/i);

    const stepUpToken = await confirmStepUp(token);
    const reEnroll = await graphql<{ reEnrollFingerprint: { fingerprintEnrolled: boolean } }>(
      'mutation($s:String!){ reEnrollFingerprint(stepUpToken:$s){ fingerprintEnrolled } }',
      { s: stepUpToken },
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

  it('rejects a replayed step-up token — single confirmation authorizes one re-enrollment only (F11 follow-up review)', async () => {
    const { token } = await registerAndLogin('StepUp Replay', 'stepup-replay@example.com');
    await enrollFingerprint(token);
    const stepUpToken = await confirmStepUp(token);

    const REENROLL_FINGERPRINT_MUTATION =
      'mutation($s:String!){ reEnrollFingerprint(stepUpToken:$s){ fingerprintEnrolled } }';

    const first = await graphql<{ reEnrollFingerprint: { fingerprintEnrolled: boolean } }>(
      REENROLL_FINGERPRINT_MUTATION,
      { s: stepUpToken },
      token,
    );
    expect(first.data?.reEnrollFingerprint.fingerprintEnrolled).toBe(true);

    // The exact same stepUpToken, still within its 5-minute window, must be
    // rejected on a second use — otherwise one password confirmation could
    // authorize an unbounded number of biometric replacements.
    const replay = await graphql(REENROLL_FINGERPRINT_MUTATION, { s: stepUpToken }, token);
    expect(replay.errors?.[0]?.message).toMatch(/step-up/i);

    // Confirms the replay didn't sneak through a second supersede.
    const rows = await prisma.biometricEnrollment.findMany({
      where: { type: 'FINGERPRINT_FLAG' },
    });
    expect(rows.filter((row) => row.supersededAt === null)).toHaveLength(1);
  });

  it('logs a FAILURE verification attempt when face is not enrolled', async () => {
    const { userId, token } = await registerAndLogin('No Face', 'no.face@example.com');

    const punch = await punchInFace(token, userId, [1, 0, 0], 'type');
    expect(punch.errors?.[0]?.message).toMatch(/not enrolled/i);

    const attempts = await prisma.verificationAttempt.findMany({ where: { userId } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.outcome).toBe('FAILURE');
  });

  it('gives a distinct, actionable error for a cross-platform verification attempt (F3)', async () => {
    const { userId, token } = await registerAndLogin(
      'Cross Platform',
      'cross.platform@example.com',
    );
    // Enrolled on Android (MobileFaceNet) only.
    await enrollFace(token, [1, 0, 0]);

    // Attempting to verify with a HUMAN_FACERES-tagged embedding must not
    // crash (the old, unguarded `isMatch` would throw on a dimension
    // mismatch, or worse, silently compare across incompatible model
    // spaces) — it must fail with a message distinguishing "wrong platform"
    // from "never enrolled at all".
    const result = await graphql(
      'mutation($userId:ID!,$emb:[Float!]!,$m:EmbeddingModel!,$type:LivenessChallengeType!,$samples:[LivenessSampleInput!]!){ punchInFace(userId:$userId,embedding:$emb,embeddingModel:$m,livenessChallengeType:$type,livenessSamples:$samples){ type } }',
      {
        userId,
        emb: [1, 0, 0],
        m: 'HUMAN_FACERES',
        type: 'BLINK',
        samples: VALID_LIVENESS_SAMPLES,
      },
      token,
    );
    expect(result.errors?.[0]?.message).toMatch(/isn't set up on this platform/i);
    expect(result.errors?.[0]?.message).not.toMatch(/^Face is not enrolled/);

    // The account's actual (Android) enrollment must still work untouched.
    const samePlatformPunch = await punchInFace(token, userId, [1, 0, 0], 'matched');
    expect(samePlatformPunch.data?.punchInFace).toMatchObject({ matched: true });
  });

  it('serves the authenticated profile via `me`, rejecting unauthenticated access', async () => {
    const { token } = await registerAndLogin('Profile User', 'profile.user@example.com');
    await enrollFingerprint(token);

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
    await enrollFingerprint(token);

    // A SUCCESS attempt (fingerprint enrolled) followed by a FAILURE attempt
    // (face never enrolled) — in that order, so most-recent-first ordering
    // is actually exercised.
    await graphql(
      'mutation($userId:ID!){ punchInFingerprint(userId:$userId){ type } }',
      { userId },
      token,
    );
    await punchInFace(token, userId, [1, 0, 0], 'type');

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
    await enrollFingerprint(token);
    await enrollFace(token, [1, 0, 0]);
    await graphql(
      'mutation($userId:ID!){ punchInFingerprint(userId:$userId){ type } }',
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

  it('logout revokes the current token server-side, even though it has not expired (F8)', async () => {
    const { token } = await registerAndLogin('Logout User', 'logout.user@example.com');

    // The token works before logout.
    const beforeLogout = await graphql('{ me { email } }', undefined, token);
    expect(beforeLogout.errors).toBeUndefined();

    const logoutResult = await graphql<{ logout: boolean }>('mutation{ logout }', undefined, token);
    expect(logoutResult.data?.logout).toBe(true);

    // The exact same (structurally still-valid, unexpired) token must now
    // be rejected — this is what distinguishes real revocation from mere
    // client-side "forgetting" of the token.
    const afterLogout = await graphql('{ me { email } }', undefined, token);
    expect(afterLogout.errors?.[0]?.message).toMatch(/unauthorized/i);

    // The plain CSV export route shares the same auth check — must also
    // reject the revoked token, not just GraphQL.
    const csvResponse = await app.inject({
      method: 'GET',
      url: '/export/attendance.csv',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(csvResponse.statusCode).toBe(401);
  });

  it('logout requires an authenticated session', async () => {
    const noAuth = await graphql('mutation{ logout }');
    expect(noAuth.errors?.[0]?.message).toMatch(/unauthorized/i);
  });

  it('revokeToken opportunistically sweeps rows past their own expiresAt (follow-up review on F8)', async () => {
    // A stale row left over from a token that has since naturally expired —
    // simulated directly rather than waiting out a real 7-day/5-minute TTL.
    await prisma.revokedToken.create({
      data: { jti: 'stale-already-expired-jti', expiresAt: new Date(Date.now() - 1000) },
    });

    // Any subsequent revocation should sweep it, since a table with no
    // cleanup job would otherwise grow across every logout/re-enrollment
    // forever.
    await revokeToken('fresh-jti', new Date(Date.now() + 60_000));

    const stale = await prisma.revokedToken.findUnique({
      where: { jti: 'stale-already-expired-jti' },
    });
    expect(stale).toBeNull();
    const fresh = await prisma.revokedToken.findUnique({ where: { jti: 'fresh-jti' } });
    expect(fresh).not.toBeNull();
  });

  it('deletes the account and cascades to enrollments, attendance, and attempts', async () => {
    const { userId, token } = await registerAndLogin('Delete Me', 'delete.me@example.com');
    await enrollFingerprint(token);
    await enrollFace(token, [1, 0, 0]);
    await graphql(
      'mutation($userId:ID!){ punchInFingerprint(userId:$userId){ type } }',
      { userId },
      token,
    );

    const DELETE_MUTATION = 'mutation($s:String!){ deleteMyAccount(stepUpToken:$s) }';

    const noAuth = await graphql(DELETE_MUTATION, { s: 'dummy' });
    expect(noAuth.errors?.[0]?.message).toMatch(/unauthorized/i);

    // A plain (merely-valid) session token must NOT work as a step-up token
    // here either — deletion needs the same server-verifiable proof
    // re-enrollment does (a follow-up review finding), not just an
    // authenticated session.
    const sessionAsStepUp = await graphql(DELETE_MUTATION, { s: token }, token);
    expect(sessionAsStepUp.errors?.[0]?.message).toMatch(/step-up/i);
    expect(await prisma.user.findUnique({ where: { id: userId } })).not.toBeNull();

    // Sanity check: real child rows exist across all three cascaded relations
    // before deletion, so the assertions below prove the cascade removed
    // something, not that the tables started empty.
    expect(await prisma.biometricEnrollment.count({ where: { userId } })).toBe(4);
    expect(await prisma.attendanceRecord.count({ where: { userId } })).toBe(1);
    expect(await prisma.verificationAttempt.count({ where: { userId } })).toBe(1);

    const stepUpToken = await confirmStepUp(token);
    const deletion = await graphql<{ deleteMyAccount: boolean }>(
      DELETE_MUTATION,
      { s: stepUpToken },
      token,
    );
    expect(deletion.data?.deleteMyAccount).toBe(true);

    expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull();
    expect(await prisma.biometricEnrollment.count({ where: { userId } })).toBe(0);
    expect(await prisma.attendanceRecord.count({ where: { userId } })).toBe(0);
    expect(await prisma.verificationAttempt.count({ where: { userId } })).toBe(0);

    // The exact (structurally still-valid, unexpired) token used to make this
    // request must now be rejected too (F8, extended here) — deletion revokes
    // the caller's own current session, not just the user row.
    const afterDelete = await graphql('{ me { email } }', undefined, token);
    expect(afterDelete.errors?.[0]?.message).toMatch(/unauthorized/i);
  });

  it('logs a FAILURE verification attempt when fingerprint is not enrolled', async () => {
    const { userId, token } = await registerAndLogin(
      'No Fingerprint',
      'no.fingerprint@example.com',
    );

    const punch = await graphql(
      'mutation($userId:ID!){ punchInFingerprint(userId:$userId){ type } }',
      { userId },
      token,
    );
    expect(punch.errors?.[0]?.message).toMatch(/not enrolled/i);

    const attempts = await prisma.verificationAttempt.findMany({ where: { userId } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.outcome).toBe('FAILURE');
  });
});
