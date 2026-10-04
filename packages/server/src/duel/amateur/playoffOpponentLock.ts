import type { PoolClient } from 'pg';
import { AppError } from '../../plugins/errors.js';

const BLOCKING_SERIES_STATUSES = ['pending', 'scheduled', 'active', 'paused'] as const;

export async function getBlockedPlayoffOpponentIds(
  client: PoolClient,
  userId: string,
  candidateUserIds: string[],
  now = new Date(),
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
       left join tournament_revision revision on revision.id = tournament.published_revision_id
       join tournament_participant higher on higher.id = series.higher_seed_participant_id
       join tournament_participant lower on lower.id = series.lower_seed_participant_id
      where series.status = any($2::text[])
        and tournament.status not in ('completed', 'cancelled', 'archived')
        and $1::uuid in (higher.user_id, lower.user_id)
        and case
              when higher.user_id = $1 then lower.user_id
              else higher.user_id
            end = any($3::uuid[])
        and exists (
          select 1 from (
            select coalesce(pair_day.starts_at, day.rescheduled_starts_at,
                            day.first_game_starts_at) as starts_at
              from tournament_round_game_day day
              left join tournament_series_game_day_schedule pair_day
                on pair_day.series_id = series.id and pair_day.round_game_day_id = day.id
             where day.round_id = series.round_id and day.status <> 'cancelled'
               and not exists (
                 select 1 from tournament_fixture_attempt attempt
                 join tournament_fixture fixture on fixture.id = attempt.fixture_id
                 where fixture.series_id = series.id and attempt.round_game_day_id = day.id
               )
            union all
            select coalesce(
                     case when fixture.rescheduled_reason is not null
                          then attempt.scheduled_starts_at end,
                     pair_day.starts_at, day.rescheduled_starts_at, day.first_game_starts_at,
                     attempt.scheduled_starts_at, fixture.scheduled_starts_at)
              from tournament_fixture fixture
              left join lateral (
                select candidate.* from tournament_fixture_attempt candidate
                where candidate.fixture_id = fixture.id
                order by candidate.attempt_number desc limit 1
              ) attempt on true
              left join tournament_round_game_day day on day.id = attempt.round_game_day_id
              left join tournament_series_game_day_schedule pair_day
                on pair_day.series_id = series.id and pair_day.round_game_day_id = day.id
             where fixture.series_id = series.id and fixture.status <> 'cancelled'
               and (attempt.id is not null or not exists (
                 select 1 from tournament_round_game_day planned_day
                 where planned_day.round_id = series.round_id
               ))
               and (attempt.id is null or attempt.status <> 'cancelled')
               and (day.id is null or day.status <> 'cancelled')
          ) effective_day
          where (effective_day.starts_at at time zone
                   coalesce(revision.rules_snapshot->'config'->>'timezone','Europe/Moscow'))::date
              = ($4::timestamptz at time zone
                   coalesce(revision.rules_snapshot->'config'->>'timezone','Europe/Moscow'))::date
        )`,
    [userId, BLOCKING_SERIES_STATUSES, candidateUserIds, now],
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
