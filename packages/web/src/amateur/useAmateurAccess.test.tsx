import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {renderHook,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ReactNode} from 'react';
import {useAuthStore} from '../auth/authStore.js';
import {useDailyStore} from '../stores/dailyStore.js';
import type {DailyStateResponse} from '../api/duel.js';
import {useAmateurAccess} from './useAmateurAccess.js';
beforeEach(()=>{
 useAuthStore.setState({accessToken:'test',user:{id:'me',displayName:'Player'}});
 useDailyStore.setState({data:null});
});
afterEach(()=>{vi.restoreAllMocks();});
function show(profile:unknown){
 vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify(profile),{headers:{'content-type':'application/json'}}));
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 return renderHook(()=>useAmateurAccess(),{wrapper:({children}:{children:ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>});
}
it('uses the current server profile when the login payload has no competition level',async()=>{
 const {result}=show({id:'me',competitionLevel:'amateur',amateurUnlockGoalsRequired:300,stats:{goals:40}});
 await waitFor(()=>expect(result.current.hasFullAccess).toBe(true));
 expect(result.current.competitionLevel).toBe('amateur');
});
it('overrides a stale beginner session with the current profile without re-login',async()=>{
 useAuthStore.getState().updateUser({competitionLevel:'beginner'});
 const {result}=show({id:'me',competitionLevel:'amateur',amateurUnlockGoalsRequired:300,stats:{goals:300}});
 await waitFor(()=>expect(result.current.hasFullAccess).toBe(true));
});
it('accepts confirmed qualifying goals even before the profile response arrives',()=>{
 useDailyStore.setState({data:{lifetime_total_goals:300,amateur_unlock_goals_required:300} as DailyStateResponse});
 const {result}=show({});expect(result.current.hasFullAccess).toBe(true);
});
it('still blocks a beginner below the configured threshold',async()=>{
 const {result}=show({id:'me',competitionLevel:'beginner',amateurUnlockGoalsRequired:300,stats:{goals:116}});
 await waitFor(()=>expect(result.current.goalsRemaining).toBe(184));
 expect(result.current.hasFullAccess).toBe(false);
});
