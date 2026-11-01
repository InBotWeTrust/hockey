import type { PoolClient } from 'pg';
import type { GameSettings } from './gameSettings.js';

export interface ResultComparison {
  kind: 'daily' | 'training';
  currentDate: string;
  current: { shots: number; goals: number; limit: number };
  previous: { day: string; shots: number; goals: number; limit: number; comparable: boolean; contextKnown?: boolean } | null;
}

export async function rememberResultContext(client: PoolClient, userId: string, mode: 'daily' | 'training', id: string, settings: GameSettings, selectedPeriod?: number): Promise<void> {
  const table = mode === 'daily' ? 'day_pool' : 'training_session';
  const limit = mode === 'daily' ? settings.daily.shotsPerPeriod * settings.daily.totalPeriods : settings.training.shotsLimit;
  const conditions = { limit, selectedPeriod: selectedPeriod ?? null, goalie: mode === 'daily' ? settings.daily.goalieId : settings.training.goalieId, speeds: settings.daily.periodSpeedPresets };
  await client.query(
    `update ${table} session set result_context = $3::jsonb || jsonb_build_object('venue',
       case when player.level >= 2 or player.amateur_access_preserved or player.daily_goals_total >= $4 then 'stadium' else 'yard' end)
     from users player where session.id=$1 and player.id=$2 and (session.result_context is null
       or ($5::boolean and session.result_context->'selectedPeriod' is distinct from $3::jsonb->'selectedPeriod'
          and not exists(select 1 from shot_session where training_session_id=session.id)))`,
    [id, userId, JSON.stringify(conditions), settings.amateur.unlockGoalsRequired, mode === 'training'],
  );
}

export async function readResultComparison(client: PoolClient, userId: string, mode: 'daily' | 'training', id: string, day: string, shots: number, goals: number): Promise<ResultComparison | null> {
  const table = mode === 'daily' ? 'day_pool' : 'training_session';
  const current = (await client.query<{result_context: {limit: number} | null}>(`select result_context from ${table} where id=$1 and user_id=$2`, [id,userId])).rows[0]?.result_context;
  if (!current || shots < current.limit) return null;
  const aggregate = mode === 'daily'
    ? 'select coalesce(sum(shots_taken),0)::int as shots, coalesce(sum(goals),0)::int as goals from period_log where day_pool_id=session.id'
    : "select count(*)::int as shots, count(*) filter(where server_result='goal')::int as goals from shot_session where training_session_id=session.id and mode='training'";
  const previous = (await client.query<{day:string;shots:number;goals:number;limit:number;comparable:boolean}>(
    `select to_char(session.day_date,'YYYY-MM-DD') as day, stats.shots, stats.goals,
       coalesce((session.result_context->>'limit')::int, ${mode === 'training' ? 'session.shots_limit' : '$4'}) as limit,
       coalesce(session.result_context=$3::jsonb, false) as comparable,
       (session.result_context is not null) as "contextKnown"
     from ${table} session cross join lateral (${aggregate}) stats
     where session.user_id=$1 and session.day_date < $2::date and stats.shots>0
     order by session.day_date desc limit 1`,
    mode === 'training' ? [userId,day,JSON.stringify(current)] : [userId,day,JSON.stringify(current),current.limit],
  )).rows[0] ?? null;
  return { kind: mode, currentDate: day, current: {shots,goals,limit:current.limit}, previous };
}
