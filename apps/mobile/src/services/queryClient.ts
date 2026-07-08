/**
 * Single shared TanStack Query client (ADR-013). Base setup only — offline
 * persistence/resumable mutations (ADR-017) are wired in Phase 4 once the
 * punch-in screens that need them exist; adding that machinery now would be
 * unused code with nothing to verify it against.
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
  },
});
