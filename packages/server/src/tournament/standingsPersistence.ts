import type { PoolClient } from 'pg';
import { scoreTournamentFixture, type RegularScoringPoints } from './scoring.js';
import {
  rankHeadToHeadStandings,
  type HeadToHeadStandingInput,
  type HeadToHeadTieCriterion,
} from './standings.js';

interface SettledFixtureRow {
  home_participant_id: string;
  away_participant_id: string;
  outcome: 'home_win' | 'away_win' | 'draw' | 'double_forfeit';
  home_score: number;
  away_score: number;
  decided_kind: 'regulation' | 'overtime' | 'shootout_initial' | 'shootout_sudden_death';
  result_snapshot: Record<string, unknown> | null;
}

const defaultScoring: RegularScoringPoints = {
  regulationWin: 3,
  overtimeWin: 2,
  overtimeLoss: 1,
  draw: 1,
  loss: 0,
  technicalLoss: 0,
};

function parseScoring(rules: Record<string, unknown>): RegularScoringPoints {
  const value = rules.regularScoring;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return defaultScoring;
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(defaultScoring).map(([key, fallback]) => [
      key,
      typeof source[key] === 'number' ? source[key] : fallback,
    ]),
  ) as unknown as RegularScoringPoints;
}

function parseCriteria(rules: Record<string, unknown>): HeadToHeadTieCriterion[] {
  const allowed = new Set<HeadToHeadTieCriterion>([
    'points',
    'wins',
    'goal_difference',
    'goals_for',
  ]);
  const configured = Array.isArray(rules.tieBreakCriteria)
    ? rules.tieBreakCriteria.filter(
        (criterion): criterion is HeadToHeadTieCriterion =>
          typeof criterion === 'string' && allowed.has(criterion as HeadToHeadTieCriterion),
      )
    : [];
  return configured.length > 0 ? configured : ['points', 'wins', 'goal_difference', 'goals_for'];
}

export async function rebuildHeadToHeadStandings(
  client: PoolClient,
  tournamentId: string,
): Promise<{ boundaryTieParticipantIds: string[] }> {
  const rulesResult = await client.query<{ rules_snapshot: Record<string, unknown> }>(
    `select r.rules_snapshot from tournament t
       join tournament_revision r on r.id = t.published_revision_id where t.id = $1`,
    [tournamentId],
  );
  const rules = rulesResult.rows[0]?.rules_snapshot ?? {};
  const config =
    typeof rules.config === 'object' && rules.config !== null
      ? (rules.config as Record<string, unknown>)
      : {};
  const playoffSize = typeof config.playoffSize === 'number' ? config.playoffSize : 2;
  const participantResult = await client.query<{ id: string }>(
    `select id from tournament_participant
      where tournament_id = $1 and state in ('approved', 'withdrawn', 'removed', 'disqualified')`,
    [tournamentId],
  );
  const fixtureResult = await client.query<SettledFixtureRow>(
    `select f.home_participant_id, f.away_participant_id, f.outcome,
            f.home_score, f.away_score, f.result_snapshot,
            coalesce(last_segment.kind, 'regulation') as decided_kind
       from tournament_fixture f
       join tournament_round r on r.id = f.round_id and r.stage = 'regular'
       left join lateral (
         select kind from tournament_fixture_segment
          where fixture_id = f.id and status = 'settled'
          order by sequence_number desc limit 1
       ) last_segment on true
      where f.tournament_id = $1 and f.status in ('settled', 'forfeit')
        and f.home_participant_id is not null and f.away_participant_id is not null
        and f.outcome is not null`,
    [tournamentId],
  );
  const table = new Map<string, HeadToHeadStandingInput & { played: number; draws: number; losses: number }>();
  for (const participant of participantResult.rows) {
    table.set(participant.id, {
      participantId: participant.id,
      points: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      played: 0,
      goalsFor: 0,
      goalsAgainst: 0,
    });
  }
  const scoring = parseScoring(rules);
  for (const fixture of fixtureResult.rows) {
    const home = table.get(fixture.home_participant_id);
    const away = table.get(fixture.away_participant_id);
    if (!home || !away) continue;
    const technical = fixture.result_snapshot?.technical === true;
    const scoringOutcome =
      technical && fixture.outcome === 'home_win'
        ? 'away_forfeit'
        : technical && fixture.outcome === 'away_win'
          ? 'home_forfeit'
          : fixture.outcome;
    const points = scoreTournamentFixture(
      scoringOutcome,
      fixture.decided_kind === 'regulation'
        ? 'regulation'
        : fixture.decided_kind === 'overtime'
          ? 'overtime'
          : 'shootout',
      scoring,
    );
    home.played += 1;
    away.played += 1;
    home.points += points.home;
    away.points += points.away;
    home.goalsFor += Number(fixture.home_score);
    home.goalsAgainst += Number(fixture.away_score);
    away.goalsFor += Number(fixture.away_score);
    away.goalsAgainst += Number(fixture.home_score);
    if (fixture.outcome === 'home_win') {
      home.wins += 1;
      away.losses += 1;
    } else if (fixture.outcome === 'away_win') {
      away.wins += 1;
      home.losses += 1;
    } else if (fixture.outcome === 'draw') {
      home.draws += 1;
      away.draws += 1;
    } else {
      home.losses += 1;
      away.losses += 1;
    }
  }
  const adjustments = await client.query<{ participant_id: string; payload: Record<string, unknown> }>(
    `select participant_id, payload from tournament_adjustment
      where tournament_id = $1 and kind = 'points' and participant_id is not null
      order by created_at, id`,
    [tournamentId],
  );
  for (const adjustment of adjustments.rows) {
    const row = table.get(adjustment.participant_id);
    if (row && typeof adjustment.payload.delta === 'number') row.points += adjustment.payload.delta;
  }
  const ranked = rankHeadToHeadStandings([...table.values()], parseCriteria(rules), playoffSize);
  await client.query(`delete from tournament_standing where tournament_id = $1`, [tournamentId]);
  for (const [index, row] of ranked.rows.entries()) {
    const expanded = table.get(row.participantId)!;
    await client.query(
      `insert into tournament_standing
         (tournament_id, participant_id, rank, played, wins, draws, losses,
          goals_for, goals_against, points, metrics, tie_key, source_version)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        tournamentId,
        row.participantId,
        index + 1,
        expanded.played,
        expanded.wins,
        expanded.draws,
        expanded.losses,
        expanded.goalsFor,
        expanded.goalsAgainst,
        expanded.points,
        JSON.stringify({ goalDifference: expanded.goalsFor - expanded.goalsAgainst }),
        JSON.stringify(parseCriteria(rules).map((criterion) => criterion)),
        fixtureResult.rows.length + adjustments.rows.length,
      ],
    );
  }
  return { boundaryTieParticipantIds: ranked.boundaryTieParticipantIds };
}
