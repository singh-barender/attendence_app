/**
 * Single shared TanStack Query client (ADR-013), plus offline-tolerant
 * punch submission (task 4.8, ADR-017) — TanStack Query's own first-party
 * persisted-mutation pattern, not a custom local queue/table.
 *
 * `@react-native-async-storage/async-storage` and
 * `@react-native-community/netinfo` both have genuine web implementations
 * built into the packages themselves (confirmed by reading their source —
 * async-storage's extensionless `AsyncStorage.ts` is `window.localStorage`-
 * backed, netinfo ships its own `nativeModule.web.ts`), unlike
 * `expo-secure-store` (a literal `{}` stub on web, ADR-014's own earlier
 * finding) — so this file needs no `.native`/`.web` split of its own.
 *
 * - `onlineManager` is fed by NetInfo so the library actually knows
 *   connectivity state, rather than guessing from fetch failures alone.
 * - Mutation defaults are registered for both punch-in mutations —
 *   required because a *paused* mutation persisted to storage loses its
 *   real `mutationFn` (functions can't be serialized); on resume, TanStack
 *   Query looks up the mutation by its `mutationKey` against these
 *   registered defaults to know how to actually re-run it. Each default's
 *   `mutationFn` is built the exact same way the generated
 *   `usePunchInFingerprintMutation`/`usePunchInFaceMutation` hooks already
 *   build theirs (`fetcher(Document, variables)`), so a resumed mutation
 *   hits the identical GraphQL operation a fresh one would.
 * - `persister` (AsyncStorage-backed) is consumed by App.tsx's
 *   `PersistQueryClientProvider` — restoring the persisted cache and then
 *   calling `resumePausedMutations()` is a provider-lifecycle concern
 *   (needs an `onSuccess` callback tied to the restore completing), not
 *   something this module can do itself.
 * - These defaults no longer need their own `onSuccess`: they used to
 *   persist the session token punch mutations returned, specifically for a
 *   mutation resumed after the *app itself* restarted (the original
 *   screen's callback, a function, can't survive being persisted to
 *   storage) — without it, that case would silently punch the user in
 *   server-side while the client believed itself still logged out with a
 *   stale token. Punch mutations no longer issue a token at all (a
 *   follow-up review finding — see `punchIn.ts`'s header comment: the
 *   session used to make the punch is already valid throughout and is
 *   never rotated), so a resumed offline punch has nothing to persist —
 *   the client's existing, never-touched token keeps working regardless.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { onlineManager, QueryClient } from '@tanstack/react-query';
import {
  PunchInFaceDocument,
  type PunchInFaceMutation,
  type PunchInFaceMutationVariables,
  PunchInFingerprintDocument,
  type PunchInFingerprintMutation,
  type PunchInFingerprintMutationVariables,
} from '../generated/graphql';
import { fetcher } from './graphqlFetcher';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
  },
});

onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(Boolean(state.isConnected));
  });
});

queryClient.setMutationDefaults(['PunchInFingerprint'], {
  mutationFn: (variables?: PunchInFingerprintMutationVariables) =>
    fetcher<PunchInFingerprintMutation, PunchInFingerprintMutationVariables>(
      PunchInFingerprintDocument,
      variables,
    )(),
});

queryClient.setMutationDefaults(['PunchInFace'], {
  mutationFn: (variables?: PunchInFaceMutationVariables) =>
    fetcher<PunchInFaceMutation, PunchInFaceMutationVariables>(PunchInFaceDocument, variables)(),
});

export const persister = createAsyncStoragePersister({ storage: AsyncStorage });
