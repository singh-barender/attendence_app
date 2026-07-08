/**
 * Session JWT issuance/verification (ADR-004) — a token is only ever issued
 * after a successful biometric verification, never from a password, since
 * there is none. Reused by every punch-in mutation and by the auth-context
 * builder for protected queries/mutations.
 */
import { jwtVerify, SignJWT } from 'jose';
import { config } from '../config';

const JWT_ALGORITHM = 'HS256';
const SESSION_DURATION = '7d';

const secretKey = new TextEncoder().encode(config.jwtSecret);

export async function issueSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(secretKey);
}

export interface SessionTokenPayload {
  userId: string;
}

export async function verifySessionToken(token: string): Promise<SessionTokenPayload> {
  const { payload } = await jwtVerify(token, secretKey, { algorithms: [JWT_ALGORITHM] });
  if (typeof payload.sub !== 'string') {
    throw new Error('Invalid session token');
  }
  return { userId: payload.sub };
}

const BEARER_PREFIX = 'Bearer ';

/**
 * The one shared "who is making this request" check, used identically by
 * the GraphQL context builder and the one plain HTTP route (CSV export,
 * ADR-014) — not reimplemented per call site (architecture.md's explicit
 * requirement). Returns null rather than throwing, since "unauthenticated"
 * is a normal, expected outcome each caller handles in its own idiom
 * (a GraphQL error vs. an HTTP 401).
 */
export async function extractUserIdFromAuthHeader(
  authHeader: string | undefined,
): Promise<string | null> {
  if (!authHeader?.startsWith(BEARER_PREFIX)) {
    return null;
  }
  try {
    const { userId } = await verifySessionToken(authHeader.slice(BEARER_PREFIX.length));
    return userId;
  } catch {
    return null;
  }
}
