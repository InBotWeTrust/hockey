import type { PoolClient } from 'pg';
import { cancelTournamentDuel } from '../duel/amateur/lifecycle.js';
import { resolveDelayedPlayoffRoundStart } from './playoffs.js';
import { grantPlayoffRewardsIfComplete } from './rewards.js';

interface SeriesDependencySource {
  type?: string;
  seriesKey?: string;
}

interface SeriesDependencies {
  key?: string;
  sources?: SeriesDependencySource[];
}

interface PlayoffSeriesRow {
  id: string;
  tournament_id: string;
  wins_required: number;
  higher_seed_participant_id: string | null;
  lower_seed_participant_id: string | null;
  higher_seed_wins: number;
  lower_seed_wins: number;
  depends_on: SeriesDependencies;
}

function snapshotInteger(snapshot: Record<string, unknown> | null, key: string, fallback: number) {
  const value = snapshot?.[key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

async function materializeNextSeriesGame(
  client: PoolClient,
  input: { seriesId: string; settledAt: Date },
): Promise<string | null> {
  const next = await client.query<{
    fixture_id: string;
    round_id: string;
    result_snapshot: Record<string, unknown> | null;
    readiness_minutes: number | null;
    game_duration_minutes: number | null;
    inter_game_break_minutes: number | null;
    next_round_game_day_id: string | null;
    next_day_starts_at: Date | null;
    has_round_game_days: boolean;
    settled_snapshot: Record<string, unknown> | null;
  }>(
    `select next_fixture.id as fixture_id, next_fixture.round_id, next_fixture.result_snapshot,
            (round.rules_snapshot->>'readinessMinutes')::int as readiness_minutes,
            (round.rules_snapshot->>'gameDurationMinutes')::int as game_duration_minutes,
            extract(epoch from next_day.inter_game_break_duration)::int / 60
              as inter_game_break_minutes,
            next_day.id as next_round_game_day_id,
            next_day.first_game_starts_at as next_day_starts_at,
            exists(
              select 1 from tournament_round_game_day day where day.round_id = next_fixture.round_id
            ) as has_round_game_days,
            settled_attempt.result_snapshot as settled_snapshot
       from tournament_playoff_series series
       join tournament_fixture next_fixture on next_fixture.series_id = series.id
       join tournament_round round on round.id = next_fixture.round_id
       join lateral (
         select attempt.result_snapshot, attempt.round_game_day_id
           from tournament_fixture fixture
           join tournament_fixture_attempt attempt on attempt.fixture_id = fixture.id
          where fixture.series_id = series.id
            and attempt.status in ('settled', 'technical_result')
            and attempt.is_result_bearing
          order by attempt.settled_at desc nulls last, attempt.attempt_number desc
          limit 1
       ) settled_attempt on true
       left join tournament_round_game_day settled_day
         on settled_day.id = settled_attempt.round_game_day_id
       left join lateral (
         select day.id, day.first_game_starts_at, day.inter_game_break_duration
           from tournament_round_game_day day
          where day.round_id = next_fixture.round_id
            and (
              settled_day.id is null
              or (
                day.day_number = settled_day.day_number
                and (
                  select count(*)
                    from tournament_fixture prior_fixture
                    join tournament_fixture_attempt prior_attempt
                      on prior_attempt.fixture_id = prior_fixture.id
                   where prior_fixture.series_id = series.id
                     and prior_attempt.round_game_day_id = day.id
                     and prior_attempt.is_result_bearing
                     and prior_attempt.status in ('settled', 'technical_result')
                ) < day.max_result_bearing_games
              )
              or day.day_number > settled_day.day_number
            )
          order by case when day.day_number = settled_day.day_number then 0 else 1 end,
                   day.day_number
          limit 1
       ) next_day on true
      where series.id = $1 and series.status = 'active'
        and next_fixture.status = 'scheduled'
        and coalesce((next_fixture.result_snapshot->>'gameNumber')::int, 1) =
            series.higher_seed_wins + series.lower_seed_wins + 1
      for update of next_fixture`,
    [input.seriesId],
  );
  const row = next.rows[0];
  if (row === undefined) return null;
  if (row.has_round_game_days && row.next_round_game_day_id === null) return null;

  const breakMinutes = row.inter_game_break_minutes ?? 5;
  const readinessMinutes = row.readiness_minutes ?? 5;
  const gameDurationMinutes = row.game_duration_minutes ?? 20;
  const afterBreakAt = new Date(input.settledAt.getTime() + breakMinutes * 60_000);
  const startsAt = new Date(
    Math.max(afterBreakAt.getTime(), row.next_day_starts_at?.getTime() ?? Number.NEGATIVE_INFINITY),
  );
  const readinessExpiresAt = new Date(startsAt.getTime() + readinessMinutes * 60_000);
  const completionWindowMs = snapshotInteger(
    row.settled_snapshot,
    'completionWindowMs',
    gameDurationMinutes * 60_000,
  );
  const hardDeadlineAt = new Date(readinessExpiresAt.getTime() + completionWindowMs);
  const resultSnapshot = {
    ...(row.settled_snapshot ?? {}),
    ...(row.result_snapshot ?? {}),
    completionWindowMs,
    readinessMode: 'manual',
  };
  const inserted = await client.query(
    `insert into tournament_fixture_attempt
       (fixture_id, round_game_day_id, attempt_number, kind, status,
        scheduled_starts_at, readiness_expires_at, hard_deadline_at,
        is_result_bearing, result_snapshot)
     values ($1, $2, 1, 'initial', 'pending', $3, $4, $5, true, $6::jsonb)
     on conflict (fixture_id, attempt_number) do nothing`,
    [
      row.fixture_id,
      row.next_round_game_day_id,
      startsAt,
      readinessExpiresAt,
      hardDeadlineAt,
      JSON.stringify(resultSnapshot),
    ],
  );
  if ((inserted.rowCount ?? 0) === 0) return null;
  await client.query(
    `update tournament_fixture
        set scheduled_starts_at = $2, window_ends_at = $3, updated_at = now()
      where id = $1 and status = 'scheduled'`,
    [row.fixture_id, startsAt, hardDeadlineAt],
  );
  return row.fixture_id;
}

export async function advanceTournamentPlayoffSeries(
  client: PoolClient,
  input: { seriesId: string; winnerParticipantId: string; settledAt: Date },
): Promise<{ completed: boolean }> {
  const advanced = await client.query<PlayoffSeriesRow>(
    `update tournament_playoff_series
        set higher_seed_wins = higher_seed_wins +
              case when higher_seed_participant_id = $2 then 1 else 0 end,
            lower_seed_wins = lower_seed_wins +
              case when lower_seed_participant_id = $2 then 1 else 0 end,
            status = 'active', updated_at = now()
      where id = $1
        and status in ('scheduled', 'active')
        and $2::uuid in (higher_seed_participant_id, lower_seed_participant_id)
      returning id, tournament_id, wins_required, higher_seed_participant_id,
                lower_seed_participant_id, higher_seed_wins, lower_seed_wins, depends_on`,
    [input.seriesId, input.winnerParticipantId],
  );
  const series = advanced.rows[0];
  if (!series) return { completed: false };
  if (
    Number(series.higher_seed_wins) < Number(series.wins_required) &&
    Number(series.lower_seed_wins) < Number(series.wins_required)
  ) {
    const nextGameNumber = Number(series.higher_seed_wins) + Number(series.lower_seed_wins) + 1;
    await client.query(
      `update tournament_fixture
          set status = 'scheduled', updated_at = now()
        where series_id = $1 and status = 'conditional'
          and coalesce((result_snapshot->>'gameNumber')::int, 1) = $2
        returning id`,
      [series.id, nextGameNumber],
    );
    await materializeNextSeriesGame(client, {
      seriesId: series.id,
      settledAt: input.settledAt,
    });
    return { completed: false };
  }

  const completed = await client.query<PlayoffSeriesRow>(
    `update tournament_playoff_series
        set status = 'completed', winner_participant_id = $2, updated_at = $3
      where id = $1 and status = 'active'
      returning id, tournament_id, wins_required, higher_seed_participant_id,
                lower_seed_participant_id, higher_seed_wins, lower_seed_wins, depends_on`,
    [input.seriesId, input.winnerParticipantId, input.settledAt],
  );
  const completedSeries = completed.rows[0];
  if (!completedSeries) return { completed: false };

  return finalizeTournamentPlayoffSeries(
    client,
    completedSeries,
    input.winnerParticipantId,
    input.settledAt,
  );
}

async function delayPastPlayoffRoundStart(
  client: PoolClient,
  input: { roundId: string },
): Promise<void> {
  const sources = await client.query<{
    source_count: number;
    completed_source_count: number;
    latest_settled_at: Date | null;
  }>(
    `select count(*)::int as source_count,
            count(*) filter (where source_series.status = 'completed')::int as completed_source_count,
            max(source_series.updated_at) as latest_settled_at
       from (
         select distinct source_series.id, source_series.status, source_series.updated_at
           from tournament_playoff_series dependent
           cross join lateral jsonb_array_elements(
             case when jsonb_typeof(dependent.depends_on->'sources') = 'array'
                  then dependent.depends_on->'sources' else '[]'::jsonb end
           ) source
           join tournament_playoff_series source_series
             on source_series.tournament_id = dependent.tournament_id
            and source_series.depends_on->>'key' = source->>'seriesKey'
          where dependent.round_id = $1
       ) source_series`,
    [input.roundId],
  );
  const sourceState = sources.rows[0];
  if (
    sourceState === undefined ||
    sourceState.source_count === 0 ||
    sourceState.completed_source_count !== sourceState.source_count ||
    sourceState.latest_settled_at === null
  ) {
    return;
  }
  const round = await client.query<{
    starts_at: Date | null;
    original_configured_start_at: Date | null;
    timezone: string;
  }>(
    `select round.starts_at,
            coalesce(
              (round.rules_snapshot->>'delayedFromStartAt')::timestamptz,
              round.starts_at
            ) as original_configured_start_at,
            coalesce(revision.rules_snapshot->'config'->>'timezone', 'UTC') as timezone
       from tournament_round round
       join tournament tournament on tournament.id = round.tournament_id
       join tournament_revision revision on revision.id = tournament.published_revision_id
      where round.id = $1
      for update of round`,
    [input.roundId],
  );
  const row = round.rows[0];
  if (
    row === undefined ||
    row.starts_at === null ||
    row.original_configured_start_at === null
  ) {
    return;
  }
  const currentStart = row.starts_at;
  const configuredStart = row.original_configured_start_at;
  const startsAt = resolveDelayedPlayoffRoundStart({
    configuredStart,
    finalPriorSeriesSettledAt: sourceState.latest_settled_at,
  });
  const deltaMs = startsAt.getTime() - currentStart.getTime();
  if (deltaMs <= 0) return;
  const timezone = row.timezone;
  await client.query(
    `update tournament_round
        set starts_at = $2, ends_at = ends_at + $3 * interval '1 millisecond',
            rules_snapshot = rules_snapshot || jsonb_build_object(
              'delayedFromStartAt', $4::timestamptz
            )
      where id = $1`,
    [input.roundId, startsAt, deltaMs, configuredStart],
  );
  await client.query(
    `update tournament_round_game_day
        set first_game_starts_at = first_game_starts_at + $2 * interval '1 millisecond',
            local_date = ((first_game_starts_at + $2 * interval '1 millisecond') at time zone $3)::date
      where round_id = $1`,
    [input.roundId, deltaMs, timezone],
  );
  await client.query(
    `update tournament_fixture
        set scheduled_starts_at = scheduled_starts_at + $2 * interval '1 millisecond',
            window_ends_at = window_ends_at + $2 * interval '1 millisecond', updated_at = now()
      where round_id = $1 and status in ('conditional', 'scheduled')
        and scheduled_starts_at is not null`,
    [input.roundId, deltaMs],
  );
  await client.query(
    `update tournament_fixture_attempt attempt
        set scheduled_starts_at = attempt.scheduled_starts_at + $2 * interval '1 millisecond',
            readiness_expires_at = attempt.readiness_expires_at + $2 * interval '1 millisecond',
            hard_deadline_at = attempt.hard_deadline_at + $2 * interval '1 millisecond',
            updated_at = now()
       from tournament_fixture fixture
      where fixture.id = attempt.fixture_id and fixture.round_id = $1
        and attempt.status = 'pending'`,
    [input.roundId, deltaMs],
  );
}

async function finalizeTournamentPlayoffSeries(
  client: PoolClient,
  completedSeries: PlayoffSeriesRow,
  winnerParticipantId: string,
  settledAt: Date,
): Promise<{ completed: boolean }> {
  await client.query(
    `update tournament_fixture
        set status = 'cancelled', updated_at = now()
      where series_id = $1 and status in ('conditional', 'scheduled', 'open', 'active')`,
    [completedSeries.id],
  );
  await client.query(
    `update tournament_fixture_attempt attempt
        set status = 'cancelled', outcome = 'cancelled',
            result_snapshot = coalesce(attempt.result_snapshot, '{}'::jsonb)
              || '{"cancelReason":"series_completed"}'::jsonb,
            settled_at = coalesce(attempt.settled_at, now()), updated_at = now()
       from tournament_fixture fixture
      where fixture.id = attempt.fixture_id
        and fixture.series_id = $1
        and fixture.status = 'cancelled'
        and attempt.status in (
          'pending', 'ready_check', 'active', 'needs_reschedule', 'needs_admin_decision'
        )`,
    [completedSeries.id],
  );
  await client.query(
    `update tournament_fixture_segment segment
        set status = 'cancelled'
       from tournament_fixture fixture
      where fixture.id = segment.fixture_id
        and fixture.series_id = $1
        and fixture.status = 'cancelled'
        and segment.status in ('pending', 'scheduled', 'active')`,
    [completedSeries.id],
  );
  const cancelledDuels = await client.query<{ id: string }>(
    `select duel.id
       from amateur_duel_match duel
       join tournament_fixture_segment segment on segment.duel_match_id = duel.id
       join tournament_fixture fixture on fixture.id = segment.fixture_id
      where fixture.series_id = $1
        and fixture.status = 'cancelled'
        and duel.source = 'tournament'
        and duel.status in ('invited', 'ready_check', 'active')
      order by duel.id`,
    [completedSeries.id],
  );
  for (const duel of cancelledDuels.rows) {
    await cancelTournamentDuel(client, {
      duelMatchId: duel.id,
      reason: 'tournament_series_cancelled',
    });
  }

  const completedKey = completedSeries.depends_on.key;
  const loserParticipantId =
    completedSeries.higher_seed_participant_id === winnerParticipantId
      ? completedSeries.lower_seed_participant_id
      : completedSeries.higher_seed_participant_id;
  await grantPlayoffRewardsIfComplete(client, completedSeries.tournament_id);
  if (completedKey === undefined || loserParticipantId === null) return { completed: true };

  const dependents = await client.query<{
    id: string;
    round_id: string;
    wins_required: number;
    higher_seed_participant_id: string | null;
    lower_seed_participant_id: string | null;
    depends_on: SeriesDependencies;
  }>(
    `select id, round_id, wins_required, higher_seed_participant_id, lower_seed_participant_id, depends_on
       from tournament_playoff_series
      where tournament_id = $1 and status = 'pending'
      for update`,
    [completedSeries.tournament_id],
  );
  for (const dependent of dependents.rows) {
    const sources = dependent.depends_on.sources ?? [];
    let higher = dependent.higher_seed_participant_id;
    let lower = dependent.lower_seed_participant_id;
    let changed = false;
    for (const [index, source] of sources.entries()) {
      if (source.seriesKey !== completedKey) continue;
      const resolved = source.type === 'winner' ? winnerParticipantId : loserParticipantId;
      if (index === 0) higher = resolved;
      else lower = resolved;
      changed = true;
    }
    if (!changed) continue;
    if (higher !== null && lower !== null) {
      const seedRanks = await client.query<{ participant_id: string; rank: number }>(
        `select participant_id, rank
           from tournament_standing
          where tournament_id = $1
            and participant_id = any($2::uuid[])`,
        [completedSeries.tournament_id, [higher, lower]],
      );
      const rankByParticipant = new Map(
        seedRanks.rows.map((standing) => [standing.participant_id, Number(standing.rank)]),
      );
      const higherRank = rankByParticipant.get(higher);
      const lowerRank = rankByParticipant.get(lower);
      if (
        higherRank === undefined ||
        lowerRank === undefined ||
        lowerRank < higherRank ||
        (lowerRank === higherRank && lower.localeCompare(higher) < 0)
      ) {
        [higher, lower] = [lower, higher];
      }
    }
    await client.query(
      `update tournament_playoff_series
          set higher_seed_participant_id = $2, lower_seed_participant_id = $3,
              status = case when $2::uuid is not null and $3::uuid is not null
                            then 'scheduled' else status end,
              updated_at = now()
        where id = $1`,
      [dependent.id, higher, lower],
    );
    if (higher === null || lower === null) continue;
    await client.query(
      `update tournament_fixture
          set home_participant_id = case
                when coalesce((result_snapshot->>'higherSeedIsHome')::boolean, true)
                then $2::uuid else $3::uuid end,
              away_participant_id = case
                when coalesce((result_snapshot->>'higherSeedIsHome')::boolean, true)
                then $3::uuid else $2::uuid end,
              status = case
                when coalesce((result_snapshot->>'gameNumber')::int, 1) <= $4
                then 'scheduled' else 'conditional' end,
              updated_at = now()
        where series_id = $1 and status in ('conditional', 'scheduled')`,
      [dependent.id, higher, lower, dependent.wins_required],
    );
    await delayPastPlayoffRoundStart(client, { roundId: dependent.round_id });
  }

  return { completed: true };
}

export async function forceTournamentPlayoffSeriesWinner(
  client: PoolClient,
  input: { seriesId: string; winnerParticipantId: string; settledAt: Date },
): Promise<{ completed: boolean }> {
  const forced = await client.query<PlayoffSeriesRow>(
    `update tournament_playoff_series
        set status = 'completed', winner_participant_id = $2, updated_at = $3
      where id = $1
        and status in ('pending', 'scheduled', 'active', 'paused')
        and $2::uuid in (higher_seed_participant_id, lower_seed_participant_id)
      returning id, tournament_id, wins_required, higher_seed_participant_id,
                lower_seed_participant_id, higher_seed_wins, lower_seed_wins, depends_on`,
    [input.seriesId, input.winnerParticipantId, input.settledAt],
  );
  const completedSeries = forced.rows[0];
  if (completedSeries === undefined) return { completed: false };
  return finalizeTournamentPlayoffSeries(
    client,
    completedSeries,
    input.winnerParticipantId,
    input.settledAt,
  );
}
