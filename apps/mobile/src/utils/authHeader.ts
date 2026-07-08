/**
 * Single place that formats the `Authorization` header value — both
 * `graphqlClient.ts` and the plain CSV export route (ADR-014) need the
 * identical `Bearer <token>` format, matching the backend's own
 * `BEARER_PREFIX` convention in `tokenService.ts`.
 */
export function formatBearerHeader(token: string): string {
  return `Bearer ${token}`;
}
