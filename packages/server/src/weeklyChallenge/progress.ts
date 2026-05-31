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
  const [{ rows: goalRows }, { rows: duelRows }, { rows: inviteRows }, { rows: trainingRows }] =
    await Promise.all([
      db.query<{ goals: string }>(
        `select count(*)::text as goals
           from shot_session
          where user_id = $1
            and server_result = 'goal'
            and created_at >= $2
            and created_at <= $3`,
        [window.userId, window.from, window.to],
      ),
      db.query<{ played: string; won: string }>(
        `select
            count(*) filter (where p.state = 'completed')::text as played,
            count(*) filter (where m.winner_user_id = $1)::text as won
           from amateur_duel_participant p
           join amateur_duel_match m on m.id = p.match_id
          where p.user_id = $1
            and m.status = 'settled'
            and coalesce(m.settled_at, m.updated_at) >= $2
            and coalesce(m.settled_at, m.updated_at) <= $3`,
        [window.userId, window.from, window.to],
      ),
      db.query<{ invites: string }>(
        `select count(*)::text as invites
           from amateur_duel_match
          where challenger_user_id = $1
            and source = 'challenge'
            and created_at >= $2
            and created_at <= $3`,
        [window.userId, window.from, window.to],
      ),
      db.query<{ completed: string }>(
        `select count(*)::text as completed
           from training_session
          where user_id = $1
            and state = 'closed'
            and coalesce(closed_at, started_at) >= $2
            and coalesce(closed_at, started_at) <= $3`,
        [window.userId, window.from, window.to],
      ),
    ]);

  return {
    goals_scored: Number(goalRows[0]?.goals ?? 0),
    duels_played: Number(duelRows[0]?.played ?? 0),
    duels_won: Number(duelRows[0]?.won ?? 0),
    duel_invites_sent: Number(inviteRows[0]?.invites ?? 0),
    trainings_completed: Number(trainingRows[0]?.completed ?? 0),
  };
}

export function isTaskCompleted(
  task: Pick<WeeklyChallengeTaskRow, 'type' | 'target'>,
  progress: WeeklyChallengeProgressMap,
): boolean {
  return progress[task.type] >= task.target;
}
