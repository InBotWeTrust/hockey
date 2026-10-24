import { useOwnProfileSummary } from '../profile/useOwnProfileSummary.js';
import {useAuthStore} from '../auth/authStore.js';
import {useDailyStore} from '../stores/dailyStore.js';
import {deriveAmateurAccess} from './amateurAccess.js';

// Login sessions may omit competitionLevel. The current server profile and
// qualifying daily progress determine UI access; mutation endpoints still enforce it.
export function useAmateurAccess(){
 const user=useAuthStore(s=>s.user);
 const daily=useDailyStore(s=>s.data);
 const profile=useOwnProfileSummary();
 return deriveAmateurAccess({
  competitionLevel:profile.data?.competitionLevel??user?.competitionLevel??null,
  qualifyingGoals:daily?.lifetime_total_goals??profile.data?.stats?.goals,
  unlockGoalsRequired:daily?.amateur_unlock_goals_required??profile.data?.amateurUnlockGoalsRequired,
 });
}
