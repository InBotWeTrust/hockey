import type { Pool, PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';
import { decideNextFixtureSegment, type FixtureSegmentKind } from './segments.js';
import { rebuildHeadToHeadStandings } from './standingsPersistence.js';
import { advanceTournamentPlayoffSeries } from './playoffSeriesLifecycle.js';
import { enqueueTournamentFixtureResultPush } from './fixtureNotifications.js';
import { lockTournamentFixture } from './locks.js';
import { resolveDefaultArena, resolveEffectiveArena } from '../arenas/service.js';
import type { ArenaSnapshot } from '../arenas/types.js';
import {
  tournamentDuelTemplateSnapshotSchema,
  type TournamentDuelTemplateSnapshot,
} from '../duel/amateur/tournamentTemplateSnapshot.js';
import {
  reconcileTournamentAttemptForFixture,
  settleEarnedTournamentAttemptForDuel,
} from './fixtureAttempts.js';

interface FixtureContextRow {
  id: string;
  tournament_id: string;
  status: string;
  tournament_status: string;
  series_status: string | null;
  scheduled_starts_at: Date | null;
  window_ends_at: Date | null;
  home_user_id: string | null;
  away_user_id: string | null;
  home_participant_id: string | null;
  venue_mode: 'home_selected' | 'neutral_default';
  venue_owner_participant_id: string | null;
  venue_owner_user_id: string | null;
  arena_theme_id: string | null;
  arena_snapshot: ArenaSnapshot | null;
  round_rules: Record<string, unknown>;
  tournament_rules: Record<string, unknown>;
}

export interface TournamentDuelFactory {
  (
    client: PoolClient,
    input: {
      templateId: string;
      homeUserId: string;
      awayUserId: string;
      startsAt: Date;
      endsAt: Date;
      readyExpiresAt?: Date;
      hardDeadlineAt?: Date;
      autoContinue?: boolean;
      templateSnapshot?: TournamentDuelTemplateSnapshot;
      now: Date;
      venue: {
        mode: 'home_selected' | 'neutral_default';
        homeUserId: string | null;
        arenaThemeId: string;
        arena: ArenaSnapshot;
      };
    },
  ): Promise<{ matchId: string }>;
}

async function resolveFixtureVenue(
  client: PoolClient,
  fixture: FixtureContextRow,
): Promise<NonNullable<Parameters<TournamentDuelFactory>[1]['venue']>> {
  if (fixture.arena_theme_id !== null && fixture.arena_snapshot !== null) {
    return {
      mode: fixture.venue_mode,
      homeUserId: fixture.venue_mode === 'home_selected' ? fixture.venue_owner_user_id : null,
      arenaThemeId: fixture.arena_theme_id,
      arena: fixture.arena_snapshot,
    };
  }
  const homeSelected = fixture.venue_mode === 'home_selected';
  const arena = homeSelected
    ? await resolveEffectiveArena(client, fixture.home_user_id!)
    : await resolveDefaultArena(client);
  const ownerParticipantId = homeSelected ? fixture.home_participant_id : null;
  await client.query(
    `update tournament_fixture
        set venue_owner_participant_id = $2,
            arena_theme_id = $3,
            arena_snapshot = $4::jsonb,
            updated_at = now()
      where id = $1`,
    [fixture.id, ownerParticipantId, arena.id, JSON.stringify(arena)],
  );
  return {
    mode: fixture.venue_mode,
    homeUserId: homeSelected ? fixture.home_user_id : null,
    arenaThemeId: arena.id,
    arena,
  };
}

function stringSetting(source: Record<string, unknown>, key: string): string | null {
  return typeof source[key] === 'string' ? source[key] : null;
}

function objectSetting(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key];
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function boundedIntegerSetting(
  primary: unknown,
  fallback: unknown,
  defaultValue: number,
  min: number,
  max: number,
): number {
  for (const value of [primary, fallback]) {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max) {
      return value;
    }
  }
  return defaultValue;
}

export async function openTournamentFixtureSegment(
  pool: Pool,
  input: { fixtureId: string; tournamentId: string; userId: string; now: Date },
  createDuel: TournamentDuelFactory,
) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await lockTournamentFixture(client, input);
    const contextResult = await client.query<FixtureContextRow>(
      `select f.id, f.tournament_id, f.status, t.status as tournament_status,
              series.status as series_status, f.scheduled_starts_at, f.window_ends_at,
              hp.user_id as home_user_id, ap.user_id as away_user_id,
              f.home_participant_id, f.venue_mode, f.venue_owner_participant_id,
              vp.user_id as venue_owner_user_id,
              f.arena_theme_id, f.arena_snapshot,
              r.rules_snapshot as round_rules, tr.rules_snapshot as tournament_rules
         from tournament_fixture f
         join tournament_round r on r.id = f.round_id
         join tournament t on t.id = f.tournament_id
         join tournament_revision tr on tr.id = t.published_revision_id
         left join tournament_playoff_series series on series.id = f.series_id
         left join tournament_participant hp on hp.id = f.home_participant_id
         left join tournament_participant ap on ap.id = f.away_participant_id
         left join tournament_participant vp on vp.id = f.venue_owner_participant_id
        where f.id = $1 and f.tournament_id = $2
        for update of f`,
      [input.fixtureId, input.tournamentId],
    );
    const fixture = contextResult.rows[0];
    if (!fixture) throw new AppError('not_found', 'fixture not found', 404);
    if (
      !['regular', 'playoff'].includes(fixture.tournament_status) ||
      (fixture.series_status !== null && !['scheduled', 'active'].includes(fixture.series_status))
    ) {
      throw new AppError('conflict', 'tournament flow is not playable', 409);
    }
    if (fixture.home_user_id !== input.userId && fixture.away_user_id !== input.userId) {
      throw new AppError('forbidden', 'fixture participant required', 403);
    }
    if (fixture.home_user_id === null || fixture.away_user_id === null) {
      throw new AppError('conflict', 'fixture participants are not resolved', 409);
    }
    if (!['scheduled', 'open', 'active'].includes(fixture.status)) {
      throw new AppError('conflict', 'fixture is not playable', 409);
    }
    const attemptResult = await client.query<{
      id: string;
      attempt_number: number;
      kind: 'initial' | 'replay';
      status: string;
      scheduled_starts_at: Date;
      readiness_expires_at: Date;
      hard_deadline_at: Date;
      amateur_duel_match_id: string | null;
      result_snapshot: Record<string, unknown> | null;
    }>(
      `select id, attempt_number, kind, status, scheduled_starts_at,
              readiness_expires_at, hard_deadline_at, amateur_duel_match_id, result_snapshot
         from tournament_fixture_attempt
        where fixture_id = $1
        order by attempt_number desc
        limit 1
        for update`,
      [fixture.id],
    );
    const attempt = attemptResult.rows[0];
    if (attempt !== undefined) {
      const reconciledAttempt = await reconcileTournamentAttemptForFixture(client, {
        fixtureId: fixture.id,
        now: input.now,
      });
      if (reconciledAttempt.changed) {
        await client.query('commit');
        throw new AppError('conflict', 'tournament attempt is not playable', 409);
      }
      if (!['pending', 'ready_check', 'active'].includes(attempt.status)) {
        throw new AppError('conflict', 'tournament attempt is not playable', 409);
      }
      if (input.now < attempt.scheduled_starts_at || input.now >= attempt.hard_deadline_at) {
        throw new AppError('fixture_window_closed', 'fixture window is closed', 409);
      }
      const attemptSegment = await client.query<{
        id: string;
        kind: string;
        sequence_number: number;
        duel_match_id: string | null;
      }>(
        `select id, kind, sequence_number, duel_match_id
           from tournament_fixture_segment
          where fixture_id = $1 and sequence_number = $2
          limit 1
          for update`,
        [fixture.id, attempt.attempt_number],
      );
      if (attempt.amateur_duel_match_id !== null) {
        const segment = attemptSegment.rows[0];
        if (segment === undefined || segment.duel_match_id !== attempt.amateur_duel_match_id) {
          throw new AppError('server_error', 'tournament attempt duel link is inconsistent', 500);
        }
        await client.query('commit');
        return {
          fixtureId: fixture.id,
          segmentId: segment.id,
          duelMatchId: attempt.amateur_duel_match_id,
          kind: segment.kind,
          sequenceNumber: Number(segment.sequence_number),
        };
      }
      const snapshot = attempt.result_snapshot ?? {};
      const templateId = stringSetting(snapshot, 'duelTemplateId');
      const templateSnapshot = tournamentDuelTemplateSnapshotSchema.safeParse(
        snapshot.templateSnapshot,
      );
      const readinessMode = stringSetting(snapshot, 'readinessMode');
      const autoContinue =
        (attempt.kind === 'replay' && readinessMode === 'auto_continue') ||
        readinessMode === 'next_game_auto_continue';
      if (templateId === null || !templateSnapshot.success) {
        throw new AppError(
          'configuration_error',
          'duel template is not configured for fixture',
          409,
        );
      }
      const segment =
        attemptSegment.rows[0] ??
        (
          await client.query<{
            id: string;
            kind: string;
            sequence_number: number;
            duel_match_id: string | null;
          }>(
            `insert into tournament_fixture_segment
               (fixture_id, sequence_number, kind, status, rules_snapshot)
             values ($1, $2, 'regulation', 'pending', $3::jsonb)
             returning id, kind, sequence_number, duel_match_id`,
            [fixture.id, attempt.attempt_number, JSON.stringify(snapshot)],
          )
        ).rows[0]!;
      const venue = await resolveFixtureVenue(client, fixture);
      const duel = await createDuel(client, {
        templateId,
        homeUserId: fixture.home_user_id,
        awayUserId: fixture.away_user_id,
        startsAt: attempt.scheduled_starts_at,
        endsAt: attempt.hard_deadline_at,
        readyExpiresAt: attempt.readiness_expires_at,
        hardDeadlineAt: attempt.hard_deadline_at,
        ...(autoContinue ? { autoContinue: true } : {}),
        templateSnapshot: templateSnapshot.data,
        now: input.now,
        venue,
      });
      await client.query(
        `update tournament_fixture_segment
            set duel_match_id = $2, status = $3
          where id = $1`,
        [segment.id, duel.matchId, autoContinue ? 'active' : 'scheduled'],
      );
      await client.query(
        `update tournament_fixture_attempt
            set amateur_duel_match_id = $2,
                status = $3,
                home_ready_at = case when $4 then $5 else home_ready_at end,
                away_ready_at = case when $4 then $5 else away_ready_at end,
                updated_at = now()
          where id = $1 and amateur_duel_match_id is null`,
        [
          attempt.id,
          duel.matchId,
          autoContinue ? 'active' : 'ready_check',
          autoContinue,
          input.now,
        ],
      );
      await client.query(
        `update tournament_fixture set status = 'active', updated_at = now() where id = $1`,
        [fixture.id],
      );
      await client.query('commit');
      return {
        fixtureId: fixture.id,
        segmentId: segment.id,
        duelMatchId: duel.matchId,
        kind: segment.kind,
        sequenceNumber: Number(segment.sequence_number),
      };
    }
    if (fixture.scheduled_starts_at === null || fixture.window_ends_at === null) {
      throw new AppError('conflict', 'fixture window is not configured', 409);
    }
    if (input.now < fixture.scheduled_starts_at || input.now >= fixture.window_ends_at) {
      throw new AppError('fixture_window_closed', 'fixture window is closed', 409);
    }
    const existing = await client.query<{
      id: string;
      kind: string;
      sequence_number: number;
      duel_match_id: string | null;
      status: string;
    }>(
      `select id, kind, sequence_number, duel_match_id, status
         from tournament_fixture_segment
        where fixture_id = $1 and status in ('pending', 'scheduled', 'active')
        order by sequence_number desc limit 1 for update`,
      [fixture.id],
    );
    if (existing.rows[0]?.duel_match_id) {
      await client.query('commit');
      return {
        fixtureId: fixture.id,
        segmentId: existing.rows[0].id,
        duelMatchId: existing.rows[0].duel_match_id,
        kind: existing.rows[0].kind,
        sequenceNumber: Number(existing.rows[0].sequence_number),
      };
    }
    const playoff = objectSetting(fixture.tournament_rules, 'playoff');
    const templateId =
      stringSetting(fixture.round_rules, 'duelTemplateId') ??
      stringSetting(fixture.tournament_rules, 'regularDuelTemplateId') ??
      stringSetting(playoff, 'duelTemplateId');
    if (templateId === null) {
      throw new AppError('configuration_error', 'duel template is not configured for fixture', 409);
    }
    const segmentResult =
      existing.rows[0] ??
      (
        await client.query<{
          id: string;
          kind: string;
          sequence_number: number;
          duel_match_id: string | null;
          status: string;
        }>(
          `insert into tournament_fixture_segment
             (fixture_id, sequence_number, kind, status, rules_snapshot)
           values ($1, 1, 'regulation', 'pending', $2) returning *`,
          [fixture.id, JSON.stringify({ duelTemplateId: templateId })],
        )
      ).rows[0]!;
    const venue = await resolveFixtureVenue(client, fixture);
    const duel = await createDuel(client, {
      templateId,
      homeUserId: fixture.home_user_id,
      awayUserId: fixture.away_user_id,
      startsAt: fixture.scheduled_starts_at,
      endsAt: fixture.window_ends_at,
      now: input.now,
      venue,
    });
    await client.query(
      `update tournament_fixture_segment
          set duel_match_id = $2, status = 'scheduled'
        where id = $1`,
      [segmentResult.id, duel.matchId],
    );
    await client.query(
      `update tournament_fixture set status = 'active', updated_at = now() where id = $1`,
      [fixture.id],
    );
    await client.query('commit');
    return {
      fixtureId: fixture.id,
      segmentId: segmentResult.id,
      duelMatchId: duel.matchId,
      kind: segmentResult.kind,
      sequenceNumber: Number(segmentResult.sequence_number),
    };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function settleTournamentSegmentForDuel(
  client: PoolClient,
  input: { duelMatchId: string; homeScore: number; awayScore: number; settledAt: Date },
): Promise<{
  fixtureId: string;
  completed: boolean;
  settledNow: boolean;
  tournamentId?: string;
  roundStage?: string;
} | null> {
  const attemptSettlement = await settleEarnedTournamentAttemptForDuel(client, {
    duelMatchId: input.duelMatchId,
    settledAt: input.settledAt,
  });
  if (attemptSettlement.matched && attemptSettlement.fixtureId !== undefined) {
    return {
      fixtureId: attemptSettlement.fixtureId,
      completed: attemptSettlement.completed,
      settledNow: attemptSettlement.settledNow,
      ...(attemptSettlement.tournamentId === undefined
        ? {}
        : { tournamentId: attemptSettlement.tournamentId }),
      ...(attemptSettlement.roundStage === undefined
        ? {}
        : { roundStage: attemptSettlement.roundStage }),
    };
  }
  const segmentResult = await client.query<{
    id: string;
    fixture_id: string;
    sequence_number: number;
    kind: FixtureSegmentKind;
    pair_number: number | null;
    status: string;
    fixture_status: string;
    series_id: string | null;
    tournament_id: string;
    round_stage: string;
    home_participant_id: string | null;
    away_participant_id: string | null;
    round_rules: Record<string, unknown>;
    tournament_rules: Record<string, unknown>;
  }>(
    `select s.id, s.fixture_id, s.sequence_number, s.kind, s.pair_number, s.status,
            f.status as fixture_status,
            f.series_id, f.tournament_id, r.stage as round_stage,
            f.home_participant_id, f.away_participant_id,
            r.rules_snapshot as round_rules,
            tr.rules_snapshot as tournament_rules
       from tournament_fixture_segment s
       join tournament_fixture f on f.id = s.fixture_id
       join tournament_round r on r.id = f.round_id
       join tournament t on t.id = f.tournament_id
       join tournament_revision tr on tr.id = t.published_revision_id
      where s.duel_match_id = $1 for update of s, f`,
    [input.duelMatchId],
  );
  const segment = segmentResult.rows[0];
  if (!segment) return null;
  if (segment.status === 'settled') {
    const fixture = await client.query<{ status: string }>(
      `select status from tournament_fixture where id = $1`,
      [segment.fixture_id],
    );
    return {
      fixtureId: segment.fixture_id,
      completed: fixture.rows[0]?.status === 'settled',
      settledNow: false,
      tournamentId: segment.tournament_id,
      roundStage: segment.round_stage,
    };
  }
  if (
    !['scheduled', 'active'].includes(segment.status) ||
    !['scheduled', 'open', 'active'].includes(segment.fixture_status)
  ) {
    return {
      fixtureId: segment.fixture_id,
      completed: false,
      settledNow: false,
      tournamentId: segment.tournament_id,
      roundStage: segment.round_stage,
    };
  }
  await client.query(
    `update tournament_fixture_segment
        set status = 'settled', home_score = $2, away_score = $3, settled_at = $4
      where id = $1`,
    [segment.id, input.homeScore, input.awayScore, input.settledAt],
  );
  await client.query(
    `update tournament_fixture
        set home_score = home_score + $2, away_score = away_score + $3, updated_at = now()
      where id = $1`,
    [segment.fixture_id, input.homeScore, input.awayScore],
  );
  const tournamentOvertimeRules = objectSetting(segment.tournament_rules, 'overtime');
  const roundOvertimeRules = objectSetting(segment.round_rules, 'overtime');
  const decision = decideNextFixtureSegment(
    {
      kind: segment.kind,
      sequenceNumber: Number(segment.sequence_number),
      pairNumber: segment.pair_number === null ? null : Number(segment.pair_number),
    },
    input.homeScore,
    input.awayScore,
    {
      overtimeCount: boundedIntegerSetting(
        roundOvertimeRules.count,
        tournamentOvertimeRules.count,
        1,
        0,
        20,
      ),
      shootoutInitialShots: boundedIntegerSetting(
        roundOvertimeRules.shootoutInitialShots,
        tournamentOvertimeRules.shootoutInitialShots,
        3,
        1,
        100,
      ),
    },
  );
  if (!decision.completed) {
    await client.query(
      `insert into tournament_fixture_segment
         (fixture_id, sequence_number, kind, pair_number, status, rules_snapshot)
       values ($1, $2, $3, $4, 'pending', $5)
       on conflict (fixture_id, sequence_number) do nothing`,
      [
        segment.fixture_id,
        decision.next.sequenceNumber,
        decision.next.kind,
        decision.next.pairNumber,
        JSON.stringify({ shotsPerParticipant: decision.shotsPerParticipant }),
      ],
    );
    return {
      fixtureId: segment.fixture_id,
      completed: false,
      settledNow: false,
      tournamentId: segment.tournament_id,
      roundStage: segment.round_stage,
    };
  }
  const winnerParticipantId =
    decision.winner === 'home' ? segment.home_participant_id : segment.away_participant_id;
  const fixtureUpdated = await client.query(
    `update tournament_fixture
        set status = 'settled', winner_participant_id = $2,
            outcome = $3, settled_at = $4, updated_at = now()
      where id = $1 and status in ('conditional', 'scheduled', 'open', 'active')
      returning id`,
    [
      segment.fixture_id,
      winnerParticipantId,
      decision.winner === 'home' ? 'home_win' : 'away_win',
      input.settledAt,
    ],
  );
  if (fixtureUpdated.rowCount === 0) {
    return {
      fixtureId: segment.fixture_id,
      completed: true,
      settledNow: false,
      tournamentId: segment.tournament_id,
      roundStage: segment.round_stage,
    };
  }
  if (segment.series_id !== null && winnerParticipantId !== null) {
    await advanceTournamentPlayoffSeries(client, {
      seriesId: segment.series_id,
      winnerParticipantId,
    });
  }
  if (segment.round_stage === 'regular') {
    await rebuildHeadToHeadStandings(client, segment.tournament_id);
  }
  await enqueueTournamentFixtureResultPush(client, {
    fixtureId: segment.fixture_id,
    homeParticipantId: segment.home_participant_id,
    awayParticipantId: segment.away_participant_id,
    winnerParticipantId,
  });
  return {
    fixtureId: segment.fixture_id,
    completed: true,
    settledNow: true,
    tournamentId: segment.tournament_id,
    roundStage: segment.round_stage,
  };
}
