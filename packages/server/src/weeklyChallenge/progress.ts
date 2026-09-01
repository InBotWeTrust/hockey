import type { Pool, PoolClient } from 'pg';
import type { WeeklyChallengeTaskRow, WeeklyChallengeTaskType } from './types.js';

type Queryable = Pool | PoolClient;

export interface ProgressWindow {
  userId: string;
  from: Date;
  to: Date;
}

export type WeeklyChallengeProgressMap = Record<WeeklyChallengeTaskType, number>;

export const EMPTY_WEEKLY_CHALLENGE_PROGRESS: WeeklyChallengeProgressMap = {
  goals_scored: 0,
  duels_played: 0,
  duels_won: 0,
  duel_invites_sent: 0,
  trainings_completed: 0,
};

export async function fetchWeeklyChallengeProgress(
  db: Queryable,
  window: ProgressWindow,
): Promise<WeeklyChallengeProgressMap> {
  const { rows } = await db.query<{
    goals: string;
    played: string;
    won: string;
    invites: string;
    completed: string;
  }>(
    `with goal_progress as (
       select count(*)::text as goals
         from shot_session
        where user_id = $1
          and server_result = 'goal'
          and created_at >= $2
          and created_at <= $3
     ), duel_progress as (
       select
         count(*) filter (where p.state = 'completed')::text as played,
         count(*) filter (where m.winner_user_id = $1)::text as won
         from amateur_duel_participant p
         join amateur_duel_match m on m.id = p.match_id
        where p.user_id = $1
          and m.status = 'settled'
          and coalesce(m.settled_at, m.updated_at) >= $2
          and coalesce(m.settled_at, m.updated_at) <= $3
     ), invite_progress as (
       select count(*)::text as invites
         from amateur_duel_match
        where challenger_user_id = $1
          and source = 'challenge'
          and created_at >= $2
          and created_at <= $3
     ), training_progress as (
       select count(*)::text as completed
         from training_session
        where user_id = $1
          and state = 'closed'
          and coalesce(closed_at, started_at) >= $2
          and coalesce(closed_at, started_at) <= $3
     )
     select goals, played, won, invites, completed
       from goal_progress
       cross join duel_progress
       cross join invite_progress
       cross join training_progress`,
    [window.userId, window.from, window.to],
  );
  const row = rows[0];

  return {
    goals_scored: Number(row?.goals ?? 0),
    duels_played: Number(row?.played ?? 0),
    duels_won: Number(row?.won ?? 0),
    duel_invites_sent: Number(row?.invites ?? 0),
    trainings_completed: Number(row?.completed ?? 0),
  };
}

export function isTaskCompleted(
  task: Pick<WeeklyChallengeTaskRow, 'type' | 'target'>,
  progress: WeeklyChallengeProgressMap,
): boolean {
  return progress[task.type] >= task.target;
}
