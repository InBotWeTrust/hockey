import type { Pool, PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';
import { awardSharedPlacePoints, calculateDailyAggregateStandings } from './standings.js';
import type { TournamentDailyMetric } from './types.js';

interface DailyParticipantSourceRow {
  participant_id: string;
  user_id: string;
  player_local_date: string;
  local_day_ended: boolean;
  period_count: number;
  goals: number;
  shots: number;
}

async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function finalizeTournamentDailyDay(
  pool: Pool,
  input: { tournamentId: string; tournamentDay: number; now: Date },
) {
  return transaction(pool, async (client) => {
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [
      `tournament-daily:${input.tournamentId}:${input.tournamentDay}`,
    ]);
    const tournamentResult = await client.query<{
      status: string;
      starts_at: Date | null;
      rules_snapshot: {
        config: {
          regularSource: string;
          dailyDays: number;
          dailyMetric: TournamentDailyMetric;
          bestDays: number | null;
        };
        dailyPlacePoints?: number[];
      };
    }>(
      `select t.status, t.starts_at, r.rules_snapshot
         from tournament t join tournament_revision r on r.id = t.published_revision_id
        where t.id = $1 for update of t`,
      [input.tournamentId],
    );
    const tournament = tournamentResult.rows[0];
    if (!tournament || tournament.rules_snapshot.config.regularSource !== 'daily_aggregate') {
      throw new AppError('not_found', 'daily tournament not found', 404);
    }
    if (tournament.starts_at === null) throw new AppError('configuration_error', 'start time missing', 409);
    if (input.tournamentDay < 1 || input.tournamentDay > tournament.rules_snapshot.config.dailyDays) {
      throw new AppError('bad_request', 'invalid tournament day', 400);
    }
    const completion = await client.query<{ participant_count: number; result_count: number }>(
      `select
         count(*)::int as participant_count,
         count(r.id)::int as result_count
       from tournament_participant p
       left join tournament_daily_result r
         on r.tournament_id = p.tournament_id
        and r.participant_id = p.id
        and r.tournament_day = $2
      where p.tournament_id = $1
        and p.state in ('approved', 'withdrawn', 'removed', 'disqualified')`,
      [input.tournamentId, input.tournamentDay],
    );
    const counts = completion.rows[0];
    if (
      counts === undefined ||
      Number(counts.participant_count) === 0 ||
      Number(counts.result_count) >= Number(counts.participant_count)
    ) {
      return { tournamentId: input.tournamentId, tournamentDay: input.tournamentDay, finalized: 0 };
    }
    const sources = await client.query<DailyParticipantSourceRow>(
      `with participant_dates as (
         select p.id as participant_id, p.user_id, u.timezone,
                ((($2::timestamptz at time zone u.timezone)::date + ($3::int - 1)))::date
                  as player_local_date
           from tournament_participant p
           join users u on u.id = p.user_id
          where p.tournament_id = $1
            and p.state in ('approved', 'withdrawn', 'removed', 'disqualified')
       )
       select pd.participant_id, pd.user_id, pd.player_local_date::text,
              $4::timestamptz >= ((pd.player_local_date + 1)::timestamp at time zone pd.timezone)
                as local_day_ended,
              count(distinct pl.period_number)::int as period_count,
              coalesce(sum(pl.goals), 0)::int as goals,
              coalesce(sum(pl.shots_taken), 0)::int as shots
         from participant_dates pd
         left join day_pool dp
           on dp.user_id = pd.user_id and dp.day_date = pd.player_local_date
         left join period_log pl on pl.day_pool_id = dp.id
        group by pd.participant_id, pd.user_id, pd.player_local_date, pd.timezone`,
      [input.tournamentId, tournament.starts_at, input.tournamentDay, input.now],
    );
    if (sources.rows.some((source) => !source.local_day_ended)) {
      throw new AppError('day_not_closed', 'participant local date is still open', 409);
    }
    const metric = tournament.rules_snapshot.config.dailyMetric;
    const placementInput = sources.rows.flatMap((source) => {
      const completed = Number(source.period_count) === 3;
      if (!completed) return [];
      const goals = completed ? Number(source.goals) : 0;
      const shots = completed ? Number(source.shots) : 0;
      return [{
        participantId: source.participant_id,
        value: metric === 'accuracy_average' ? (shots === 0 ? 0 : goals / shots) : goals,
      }];
    });
    const points = awardSharedPlacePoints(
      placementInput,
      tournament.rules_snapshot.dailyPlacePoints ?? placementInput.map((_, index) => placementInput.length - index),
    );
    const placementByParticipant = new Map(points.map((place) => [place.participantId, place]));
    for (const source of sources.rows) {
      const completed = Number(source.period_count) === 3;
      const goals = completed ? Number(source.goals) : 0;
      const shots = completed ? Number(source.shots) : 0;
      const placement = placementByParticipant.get(source.participant_id);
      await client.query(
        `insert into tournament_daily_result
           (tournament_id, participant_id, tournament_day, player_local_date,
            goals, shots, accuracy, place, place_points, completed, source_snapshot, finalized_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         on conflict (tournament_id, participant_id, tournament_day) do update
           set player_local_date = excluded.player_local_date, goals = excluded.goals,
               shots = excluded.shots, accuracy = excluded.accuracy, place = excluded.place,
               place_points = excluded.place_points, completed = excluded.completed,
               source_snapshot = excluded.source_snapshot, finalized_at = excluded.finalized_at`,
        [
          input.tournamentId,
          source.participant_id,
          input.tournamentDay,
          source.player_local_date,
          goals,
          shots,
          shots === 0 ? 0 : goals / shots,
          placement?.place ?? null,
          placement?.points ?? 0,
          completed,
          JSON.stringify({ userId: source.user_id, periodCount: Number(source.period_count) }),
          input.now,
        ],
      );
    }
    const allResults = await client.query<{
      participant_id: string;
      tournament_day: number;
      goals: number;
      shots: number;
      completed: boolean;
      place_points: number;
    }>(
      `select participant_id, tournament_day, goals, shots, completed, place_points
         from tournament_daily_result where tournament_id = $1`,
      [input.tournamentId],
    );
    const standings = calculateDailyAggregateStandings(
      allResults.rows.map((row) => ({
        participantId: row.participant_id,
        day: Number(row.tournament_day),
        goals: Number(row.goals),
        shots: Number(row.shots),
        completed: row.completed,
        placePoints: Number(row.place_points),
      })),
      { metric, bestDays: tournament.rules_snapshot.config.bestDays },
    );
    await client.query(`delete from tournament_standing where tournament_id = $1`, [input.tournamentId]);
    for (const [index, standing] of standings.entries()) {
      await client.query(
        `insert into tournament_standing
           (tournament_id, participant_id, rank, points, metrics, tie_key, source_version)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          input.tournamentId,
          standing.participantId,
          index + 1,
          standing.value,
          JSON.stringify({ metric, countedDays: standing.countedDays }),
          JSON.stringify([standing.value]),
          allResults.rows.length,
        ],
      );
    }
    return { tournamentId: input.tournamentId, tournamentDay: input.tournamentDay, finalized: sources.rows.length };
  });
}

export async function finalizeDueTournamentDailyDays(pool: Pool, now: Date) {
  const { rows } = await pool.query<{ tournament_id: string; tournament_day: number }>(
    `select t.id as tournament_id, days.tournament_day
       from tournament t
       join tournament_revision r on r.id = t.published_revision_id
       cross join lateral generate_series(
         1,
         greatest(0, coalesce((r.rules_snapshot->'config'->>'dailyDays')::int, 0))
       ) as days(tournament_day)
      where t.status = 'regular'
        and t.regular_source = 'daily_aggregate'
        and t.starts_at is not null
        and exists (
          select 1 from tournament_participant p
           where p.tournament_id = t.id
             and p.state in ('approved', 'withdrawn', 'removed', 'disqualified')
        )
        and not exists (
          select 1
            from tournament_participant p
            join users u on u.id = p.user_id
           where p.tournament_id = t.id
             and p.state in ('approved', 'withdrawn', 'removed', 'disqualified')
             and $1::timestamptz < (
               ((t.starts_at at time zone u.timezone)::date + days.tournament_day)::timestamp
               at time zone u.timezone
             )
        )
        and exists (
          select 1
            from tournament_participant p
           where p.tournament_id = t.id
             and p.state in ('approved', 'withdrawn', 'removed', 'disqualified')
             and not exists (
               select 1 from tournament_daily_result result
                where result.tournament_id = t.id
                  and result.participant_id = p.id
                  and result.tournament_day = days.tournament_day
             )
        )
      order by t.id, days.tournament_day`,
    [now],
  );
  let finalizedDays = 0;
  let finalizedParticipants = 0;
  for (const row of rows) {
    const result = await finalizeTournamentDailyDay(pool, {
      tournamentId: row.tournament_id,
      tournamentDay: Number(row.tournament_day),
      now,
    });
    if (result.finalized > 0) {
      finalizedDays += 1;
      finalizedParticipants += result.finalized;
    }
  }
  return { finalizedDays, finalizedParticipants };
}
