import type { Pool, PoolClient } from 'pg';
import { observeAchievementStage } from './stageProgress.js';

/** Keep the historical peak so completed fan levels survive unsubscribe events. */
export async function observeFanAchievement(db: Pool | PoolClient, userId: string): Promise<void> {
  const result = await db.query<{ state: { followers: number } }>(
    `insert into achievement_progress(user_id,key,state,updated_at)
     values($1,'fans-support',jsonb_build_object('followers',(select count(*)::int from user_follows where player_id=$1)),now())
     on conflict(user_id,key) do update set
       state=jsonb_build_object('followers',greatest(coalesce((achievement_progress.state->>'followers')::int,0),(excluded.state->>'followers')::int)),
       updated_at=now()
     returning state`, [userId]);
  const occurredAt=new Date();
  await observeAchievementStage(db,userId,'fans-support',{
    eventKey:`fans:${occurredAt.toISOString()}:${result.rows[0]!.state.followers}`,
    occurredAt,
    progress:{followers:result.rows[0]!.state.followers},
  });
}
