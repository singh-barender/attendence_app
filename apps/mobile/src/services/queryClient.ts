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
 * - Each default also registers `onSuccess` to persist the returned session
 *   token. This looks redundant with `LoginPunchInScreen`'s own per-call
 *   `onSuccess` (which does the same, plus navigation) — it isn't: TanStack
 *   Query builds a mutation's actual options via `{...defaults, ...perCallOptions}`
 *   (a flat object spread, confirmed by reading `defaultMutationOptions` in
 *   `query-core`), so a live screen's `onSuccess` always wins over this
 *   default while the screen is mounted. This default only ever actually
 *   runs for a mutation that was paused, then the *app itself* was
 *   restarted before connectivity returned — `resumePausedMutations()`
 *   rebuilds that mutation from these defaults alone, since the original
 *   screen's callback (a function) couldn't survive being persisted to
 *   storage. Without this, that specific case would silently punch the
 *   user in server-side while leaving the client still logged out.
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
import { setAuthToken } from './graphqlClient';
import { fetcher } from './graphqlFetcher';
import { saveToken } from './tokenStorage';

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

async function persistTokenIfPresent(token: string | null | undefined): Promise<void> {
  if (!token) {
    return;
  }
  await saveToken(token);
  setAuthToken(token);
}

queryClient.setMutationDefaults(['PunchInFingerprint'], {
  mutationFn: (variables?: PunchInFingerprintMutationVariables) =>
    fetcher<PunchInFingerprintMutation, PunchInFingerprintMutationVariables>(
      PunchInFingerprintDocument,
      variables,
    )(),
  onSuccess: (data) => persistTokenIfPresent(data.punchInFingerprint?.token),
});

queryClient.setMutationDefaults(['PunchInFace'], {
  mutationFn: (variables?: PunchInFaceMutationVariables) =>
    fetcher<PunchInFaceMutation, PunchInFaceMutationVariables>(PunchInFaceDocument, variables)(),
  onSuccess: (data) => persistTokenIfPresent(data.punchInFace?.token),
});

export const persister = createAsyncStoragePersister({ storage: AsyncStorage });
