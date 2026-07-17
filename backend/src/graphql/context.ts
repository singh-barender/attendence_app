/**
 * Builds the per-request GraphQL context: resolves the session via the
 * shared auth check (tokenService.extractSessionFromAuthHeader) — the same
 * check the plain CSV export route uses (ADR-014), not reimplemented here.
 * `jti` (the current token's own ID) is carried through so `logout` can
 * revoke exactly *this* token (F8) without needing to re-parse the
 * Authorization header itself.
 */
import type { FastifyRequest } from 'fastify';
import { extractSessionFromAuthHeader } from '../services/tokenService';

export interface GraphQLContext {
  userId: string | null;
  jti: string | null;
  /** The current token's own JWT `exp` (unix seconds) — `logout` needs this
   * to record a real `expiresAt` on the `RevokedToken` row it writes. */
  exp: number | null;
}

export async function buildContext(request: FastifyRequest): Promise<GraphQLContext> {
  const session = await extractSessionFromAuthHeader(request.headers.authorization);
  return { userId: session?.userId ?? null, jti: session?.jti ?? null, exp: session?.exp ?? null };
}

/** The single choke point for protected queries/mutations (coding-standards.md). */
export function requireUserId(ctx: GraphQLContext): string {
  if (!ctx.userId) {
    throw new Error('Unauthorized — a valid session token is required');
  }
  return ctx.userId;
}
