import type { QueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../auth/authStore.js';
import { fetchOwnProfileSummary, ownProfileSummaryKey } from '../profile/useOwnProfileSummary.js';

/** Gameplay routes own their authoritative hydration; the app gate only needs account metadata. */
export async function prepareInitialPlayerExperience(
  queryClient: QueryClient,
  options: { preloadRootRoute?: () => Promise<unknown> } = {},
): Promise<void> {
  const owner = useAuthStore.getState().user?.id;
  await Promise.all([
    queryClient.fetchQuery({queryKey:ownProfileSummaryKey(owner),queryFn:({signal})=>fetchOwnProfileSummary(signal),staleTime:30_000}),
    options.preloadRootRoute?.(),
  ]);
}
