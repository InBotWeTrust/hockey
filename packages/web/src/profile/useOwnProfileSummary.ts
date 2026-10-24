import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../auth/authStore.js';
import { apiFetch } from '../api/apiFetch.js';
import type { ProfileData } from '../screens/profileTypes.js';
export type OwnProfileSummary = Omit<ProfileData, 'achievements' | 'trophyDetails'>;
export const ownProfileSummaryKey = (owner: string | null | undefined) => ['profile','summary',owner ?? null] as const;
export function fetchOwnProfileSummary(signal?: AbortSignal, fresh = false): Promise<OwnProfileSummary> {
  return apiFetch<OwnProfileSummary>('/me?summary=true&countersOnly=true', {...(signal ? {signal} : {}), ...(fresh ? {cache: 'no-store' as const} : {})});
}
export function useOwnProfileSummary(enabled = true, {fresh = false}: {fresh?: boolean} = {}) {
  const owner = useAuthStore(state => state.user?.id);
  const client = useQueryClient();
  const fullState = client.getQueryState<ProfileData>(['profile']);
  const cached = owner && fullState && fullState.data?.id === owner && !fullState.isInvalidated ? fullState : undefined;
  return useQuery({
    queryKey: ownProfileSummaryKey(owner), queryFn: ({signal}) => fetchOwnProfileSummary(signal, fresh),
    enabled: enabled && Boolean(owner),
    staleTime: fresh ? 0 : 30_000,
    ...(fresh ? {refetchOnMount: 'always' as const, refetchOnWindowFocus: true} : {}),
    ...(cached ? {initialData: cached.data!, initialDataUpdatedAt: cached.dataUpdatedAt} : {}),
  });
}
