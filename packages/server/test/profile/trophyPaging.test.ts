import { expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { fetchTrophyDetails } from '../../src/profile/summary.js';
it('limits challenge history at the database boundary and skips tournament work for that category',async()=>{
 const query=vi.fn().mockResolvedValue({rows:[]});
 const details=await fetchTrophyDetails({query} as unknown as Pool,'player',{section:'completedChallenges',limit:21,offset:40});
 expect(details).toEqual({regularSeasonWins:[],tournamentChampionships:[],tournamentPodiums:[],completedChallenges:[]});
 expect(query).toHaveBeenCalledTimes(1);
 const [sql,args]=query.mock.calls[0]!;
 expect(sql).toMatch(/limit \$2 offset \$3/);
 expect(args).toEqual(['player',21,40]);
});
