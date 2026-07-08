/**
 * Custom fetcher for generated TanStack Query hooks (ADR-012). Not the
 * plugin's built-in `fetcher: 'graphql-request'` template — that template
 * targets graphql-request's pre-v7 API (a `dist/types.dom` subpath export
 * and an object-shaped `.request()` overload that no longer typechecks
 * against the latest-stable graphql-request@7, see decisions.md ADR-025).
 * This adapter calls the client with a plain query string, sidestepping
 * graphql-request's `RequestOptions<V>` conditional type (it's keyed off a
 * concrete V and can't resolve through this function's generic TVariables —
 * a single cast to that library type is the documented graphql-request
 * pattern for generic passthrough wrappers, not an escape into `any`).
 */
import type { RequestOptions } from 'graphql-request';
import { graphqlClient } from './graphqlClient';

export function fetcher<TData, TVariables extends { [key: string]: unknown }>(
  document: { toString(): string },
  variables?: TVariables,
): () => Promise<TData> {
  return async () => {
    const options = {
      document: document.toString(),
      ...(variables === undefined ? {} : { variables }),
    } as RequestOptions<TVariables, TData>;
    return graphqlClient.request<TData, TVariables>(options);
  };
}
