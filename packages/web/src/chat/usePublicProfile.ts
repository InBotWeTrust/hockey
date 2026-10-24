import { useQuery } from '@tanstack/react-query';
import { fetchUserProfile } from './api.js';
import { userKeys } from '../lib/queryKeys.js';

export function usePublicProfile(userId: string, viewerId: string | null, countersOnly = true, enabled = true) {
  return useQuery({
    queryKey: countersOnly ? userKeys.summary(viewerId, userId) : userKeys.profile(userId),
    queryFn: ({ signal }) => fetchUserProfile(userId, { summary: true, countersOnly, signal }),
    enabled: enabled && userId.length > 0,
    staleTime: 60_000,
  });
}
