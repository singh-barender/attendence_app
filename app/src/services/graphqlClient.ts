/**
 * Single shared GraphQLClient instance (ADR-013) — configured once with the
 * backend base URL (Expo's `EXPO_PUBLIC_*` env var convention, inlined at
 * build time, no extra config-loading dependency needed) and the session
 * JWT once a user identifies/punches in. Every generated query/mutation hook
 * (ADR-012) is bound to this one client, not a new instance per call.
 */
import { GraphQLClient } from 'graphql-request';
import { getApiUrl } from '../utils/apiUrl';
import { formatBearerHeader } from '../utils/authHeader';

export const graphqlClient = new GraphQLClient(`${getApiUrl()}/graphql`);

export function setAuthToken(token: string | null): void {
  if (token) {
    graphqlClient.setHeader('Authorization', formatBearerHeader(token));
  } else {
    graphqlClient.setHeaders({});
  }
}
