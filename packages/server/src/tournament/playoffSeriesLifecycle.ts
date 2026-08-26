import type { PoolClient } from 'pg';
import { cancelTournamentDuel } from '../duel/amateur/lifecycle.js';
import { enqueueTournamentSeriesNextGamePush } from './fixtureNotifications.js';
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

export async function advanceTournamentPlayoffSeries(
  client: PoolClient,
  input: { seriesId: string; winnerParticipantId: string },
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
    const promoted = await client.query<{ id: string }>(
      `update tournament_fixture
          set status = 'scheduled', updated_at = now()
        where series_id = $1 and status = 'conditional'
          and coalesce((result_snapshot->>'gameNumber')::int, 1) = $2
        returning id`,
      [series.id, nextGameNumber],
    );
    for (const fixture of promoted.rows) {
      await enqueueTournamentSeriesNextGamePush(client, { fixtureId: fixture.id });
    }
    return { completed: false };
  }

  const completed = await client.query<PlayoffSeriesRow>(
    `update tournament_playoff_series
        set status = 'completed', winner_participant_id = $2, updated_at = now()
      where id = $1 and status = 'active'
      returning id, tournament_id, wins_required, higher_seed_participant_id,
                lower_seed_participant_id, higher_seed_wins, lower_seed_wins, depends_on`,
    [input.seriesId, input.winnerParticipantId],
  );
  const completedSeries = completed.rows[0];
  if (!completedSeries) return { completed: false };

  await client.query(
    `update tournament_fixture
        set status = 'cancelled', updated_at = now()
      where series_id = $1 and status in ('conditional', 'scheduled', 'open', 'active')`,
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
    completedSeries.higher_seed_participant_id === input.winnerParticipantId
      ? completedSeries.lower_seed_participant_id
      : completedSeries.higher_seed_participant_id;
  await grantPlayoffRewardsIfComplete(client, completedSeries.tournament_id);
  if (completedKey === undefined || loserParticipantId === null) return { completed: true };

  const dependents = await client.query<{
    id: string;
    wins_required: number;
    higher_seed_participant_id: string | null;
    lower_seed_participant_id: string | null;
    depends_on: SeriesDependencies;
  }>(
    `select id, wins_required, higher_seed_participant_id, lower_seed_participant_id, depends_on
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
      const resolved = source.type === 'winner' ? input.winnerParticipantId : loserParticipantId;
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
    const firstFixture = await client.query<{ id: string }>(
      `select id from tournament_fixture
        where series_id = $1 and status = 'scheduled'
          and coalesce((result_snapshot->>'gameNumber')::int, 1) = 1`,
      [dependent.id],
    );
    const fixtureId = firstFixture.rows[0]?.id;
    if (fixtureId !== undefined) {
      await enqueueTournamentSeriesNextGamePush(client, { fixtureId });
    }
  }

  return { completed: true };
}
