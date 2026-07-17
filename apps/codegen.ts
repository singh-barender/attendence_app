/**
 * GraphQL Code Generator config (ADR-012) — generates typed TanStack Query
 * hooks (ADR-013) from the backend's schema and this app's `.graphql`
 * operation documents. Schema is static SDL exported by the backend
 * (`pnpm --filter @attendance-app/backend print-schema`), not live
 * introspection, so codegen never needs a running dev server.
 */
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: '../backend/schema.graphql',
  documents: 'src/graphql/**/*.graphql',
  generates: {
    'src/generated/graphql.ts': {
      // 'typescript-operations' already emits schema-level types (enums,
      // inputs, objects) via its own schema-AST visit — adding the base
      // 'typescript' plugin alongside it duplicates every declaration
      // (see decisions.md ADR-025).
      plugins: ['typescript-operations', 'typescript-react-query'],
      config: {
        // Path is resolved relative to the generated output file
        // (src/generated/graphql.ts), not this config file.
        fetcher: { func: '../services/graphqlFetcher#fetcher', isReactHook: false },
        reactQueryVersion: 5,
        exposeQueryKeys: true,
        exposeMutationKeys: true,
        // Without this, the custom DateTime scalar (backend's
        // scalars.ts — an ISO 8601 string over the wire) generates as
        // `unknown`, forcing every consumer to cast instead of just
        // parsing a string.
        scalars: { DateTime: 'string' },
      },
    },
  },
};

export default config;
