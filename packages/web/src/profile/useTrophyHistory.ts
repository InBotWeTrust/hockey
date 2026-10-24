import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchUserTrophyDetails, type TrophyDetails } from '../chat/api.js';
export function useTrophyHistory(userId:string,section:keyof TrophyDetails|null,enabled:boolean) {
  const query=useInfiniteQuery({
    queryKey:['users',userId,'trophies',section],
    queryFn:({pageParam,signal})=>fetchUserTrophyDetails(userId,{section:section!,offset:pageParam,signal}),
    initialPageParam:0,
    getNextPageParam:(page)=>page.nextOffset ?? undefined,
    enabled:enabled && section!==null && userId.length>0,
    staleTime:60_000,
  });
  const data:TrophyDetails|undefined=query.data ? {regularSeasonWins:[],tournamentChampionships:[],tournamentPodiums:[],completedChallenges:[]} : undefined;
  if(data && query.data) for(const key of Object.keys(data) as Array<keyof TrophyDetails>) {
    const seen=new Set<string>();
    for(const page of query.data.pages) for(const item of page[key]) {
      if(seen.has(item.id))continue;
      seen.add(item.id);
      // Each category has its own DTO; the source and destination keys always match.
      (data[key] as Array<typeof item>).push(item);
    }
  }
  return {...query,data};
}
