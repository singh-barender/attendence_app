/**
 * Builds the per-request GraphQL context: resolves `userId` via the shared
 * auth check (tokenService.extractUserIdFromAuthHeader, ADR-004) — the same
 * check the plain CSV export route uses (ADR-014), not reimplemented here.
 */
import type { FastifyRequest } from 'fastify';
import { extractUserIdFromAuthHeader } from '../services/tokenService';

export interface GraphQLContext {
  userId: string | null;
}

export async function buildContext(request: FastifyRequest): Promise<GraphQLContext> {
  const userId = await extractUserIdFromAuthHeader(request.headers.authorization);
  return { userId };
}

/** The single choke point for protected queries/mutations (coding-standards.md). */
export function requireUserId(ctx: GraphQLContext): string {
  if (!ctx.userId) {
    throw new Error('Unauthorized — a valid session token is required');
  }
  return ctx.userId;
}
