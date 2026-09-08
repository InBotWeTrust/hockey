import type { PoolClient } from 'pg';
import { AppError } from '../../plugins/errors.js';

const BLOCKING_SERIES_STATUSES = ['pending', 'scheduled', 'active', 'paused'] as const;

export async function getBlockedPlayoffOpponentIds(
  client: PoolClient,
  userId: string,
  candidateUserIds: string[],
): Promise<Set<string>> {
  if (candidateUserIds.length === 0) return new Set();

  const { rows } = await client.query<{ opponent_user_id: string }>(
    `select distinct
            case
              when higher.user_id = $1 then lower.user_id
              else higher.user_id
            end as opponent_user_id
       from tournament_playoff_series series
       join tournament on tournament.id = series.tournament_id
       join tournament_participant higher on higher.id = series.higher_seed_participant_id
       join tournament_participant lower on lower.id = series.lower_seed_participant_id
      where series.status = any($2::text[])
        and tournament.status not in ('completed', 'cancelled', 'archived')
        and $1::uuid in (higher.user_id, lower.user_id)
        and case
              when higher.user_id = $1 then lower.user_id
              else higher.user_id
            end = any($3::uuid[])`,
    [userId, BLOCKING_SERIES_STATUSES, candidateUserIds],
  );

  return new Set(rows.map((row) => row.opponent_user_id));
}

export async function assertNotPlayoffOpponents(
  client: PoolClient,
  firstUserId: string,
  secondUserId: string,
): Promise<void> {
  const blocked = await getBlockedPlayoffOpponentIds(client, firstUserId, [secondUserId]);
  if (blocked.has(secondUserId)) {
    throw new AppError(
      'playoff_opponent_blocked',
      'playoff opponent is unavailable for ordinary duels',
      409,
    );
  }
}
