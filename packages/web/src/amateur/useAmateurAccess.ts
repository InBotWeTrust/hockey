import {useQuery} from '@tanstack/react-query';
import {apiFetch} from '../api/apiFetch.js';
import {useAuthStore} from '../auth/authStore.js';
import {useDailyStore} from '../stores/dailyStore.js';
import type {ProfileData} from '../screens/profileTypes.js';
import {deriveAmateurAccess} from './amateurAccess.js';

// Login sessions may omit competitionLevel. The current server profile and
// qualifying daily progress determine UI access; mutation endpoints still enforce it.
export function useAmateurAccess(){
 const user=useAuthStore(s=>s.user);
 const daily=useDailyStore(s=>s.data);
 const profile=useQuery<ProfileData>({
  queryKey:['profile'],queryFn:()=>apiFetch<ProfileData>('/me'),
  enabled:Boolean(user?.id),staleTime:30_000,
 });
 return deriveAmateurAccess({
  competitionLevel:profile.data?.competitionLevel??user?.competitionLevel??null,
  qualifyingGoals:daily?.lifetime_total_goals??profile.data?.stats?.goals,
  unlockGoalsRequired:daily?.amateur_unlock_goals_required??profile.data?.amateurUnlockGoalsRequired,
 });
}
