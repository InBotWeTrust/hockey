import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  auditAutomaticTournamentLifecycle,
  auditCompletedLegacyDailyTournamentLifecycle,
} from '../../src/tournament/automaticLifecycleAudit.js';
import { parseTournamentConfig } from '../../src/tournament/config.js';
import {
  generateRegularSchedule,
  publishRegularSchedule,
  type TournamentRulesSnapshot,
} from '../../src/tournament/service.js';
import {
  createTestPool,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
} from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const CREATOR_ID = '00000000-0000-4000-8000-000000008001';
const NOW = new Date('2030-09-01T12:00:00.000Z');

function legacyRules(
  source: 'head_to_head' | 'daily_aggregate' | 'classic' = 'head_to_head',
  playoffSize: 2 | 4 = 4,
): TournamentRulesSnapshot {
  const base = {
    participantLimit: 4,
    playoffSize,
    timezone: 'Europe/Moscow',
    registrationMode: 'open' as const,
    visibility: 'public' as const,
    entryFeeCoins: 0,
  };
  return {
    config: parseTournamentConfig(
      source === 'head_to_head'
        ? {
            ...base,
            regularSource: source,
            roundRobinCycles: 1,
            roundsPerDay: 3,
            firstRoundLocalTime: '16:00',
            fixtureWindowMs: 60_000,
            roundBreakMs: 0,
            dailyDays: null,
            dailyMetric: null,
            bestDays: null,
          }
        : {
            ...base,
            regularSource: source,
            roundRobinCycles: null,
            roundsPerDay: null,
            firstRoundLocalTime: null,
            fixtureWindowMs: null,
            roundBreakMs: null,
            dailyDays: 3,
            dailyMetric: 'goals_sum',
            bestDays: null,
            ...(source === 'classic'
              ? {
                  classicRules: {
                    goalieId: 'legacy-classic-goalie',
                    shotsPerPeriod: 1,
                    periodDurationMs: 60_000,
                    breakDurationMs: 0,
                    incompleteResultPolicy: 'completed_game' as const,
                    periodSpeedPresets: [
                      {
                        periodNumber: 1 as const,
                        goalFrequency: 0.55,
                        goalieFrequency: 0.65,
                        shooterFrequency: 0.8,
                        puckSpeedPerMs: 1.3,
                      },
                      {
                        periodNumber: 2 as const,
                        goalFrequency: 0.72,
                        goalieFrequency: 0.84,
                        shooterFrequency: 1,
                        puckSpeedPerMs: 1.55,
                      },
                      {
                        periodNumber: 3 as const,
                        goalFrequency: 0.9,
                        goalieFrequency: 1.05,
                        shooterFrequency: 1.18,
                        puckSpeedPerMs: 1.8,
                      },
                    ],
                  },
                }
              : {}),
          },
    ),
    eligibility: {
      minLevel: null,
      maxLevel: null,
      minGoals: 0,
      minExperience: 0,
      invitedUserIds: [],
      bannedUserIds: [],
    },
  };
}

async function seedLegacyTournament(
  pool: Pool,
  slug: string,
  input: {
    source?: 'head_to_head' | 'daily_aggregate' | 'classic';
    participantCount?: number;
    playoffSize?: 2 | 4;
    userIdOffset?: number;
  } = {},
) {
  const source = input.source ?? 'head_to_head';
  const participantCount = input.participantCount ?? 4;
  const playoffSize = input.playoffSize ?? 4;
  const userIdOffset = input.userIdOffset ?? 0;
  const tournament = await pool.query<{ id: string }>(
    `insert into tournament
       (slug, title, status, regular_source, current_revision, registration_opens_at,
        registration_closes_at, starts_at, created_by)
     values ($1, 'Legacy cup', 'registration', $2, 1, $3, $4, $5, $6)
     returning id`,
    [
      slug,
      source,
      new Date('2030-09-02T12:00:00.000Z'),
      new Date('2030-09-03T12:00:00.000Z'),
      new Date('2030-09-04T12:00:00.000Z'),
      CREATOR_ID,
    ],
  );
  const tournamentId = tournament.rows[0]!.id;
  const revision = await pool.query<{ id: string }>(
    `insert into tournament_revision
       (tournament_id, revision, rules_snapshot, is_published, created_by, published_at)
     values ($1, 1, $2, true, $3, $4)
     returning id`,
    [tournamentId, JSON.stringify(legacyRules(source, playoffSize)), CREATOR_ID, NOW],
  );
  await pool.query(`update tournament set published_revision_id = $2 where id = $1`, [
    tournamentId,
    revision.rows[0]!.id,
  ]);
  for (let index = 0; index < participantCount; index += 1) {
    const userId = `00000000-0000-4000-8000-${String(8_100 + userIdOffset + index).padStart(12, '0')}`;
    await pool.query(
      `insert into users (id, display_name, timezone, role)
       values ($1, $2, 'Europe/Moscow', 'player')`,
      [userId, `Player ${index + 1}`],
    );
    await pool.query(
      `insert into tournament_participant (tournament_id, user_id, state, joined_at)
       values ($1, $2, 'approved', $3)`,
      [tournamentId, userId, NOW],
    );
  }
  return { id: tournamentId };
}

async function tournamentFingerprint(pool: Pool, tournamentId: string) {
  const result = await pool.query<{ fingerprint: Record<string, unknown> }>(
    `select jsonb_build_object(
       'tournament', (select to_jsonb(tournament) from tournament where id = $1),
       'revision', (select to_jsonb(revision) from tournament_revision revision
          where revision.id = (select published_revision_id from tournament where id = $1)),
       'participants', coalesce((select jsonb_agg(to_jsonb(participant) order by participant.id)
          from tournament_participant participant where participant.tournament_id = $1), '[]'::jsonb),
       'matchdays', coalesce((select jsonb_agg(to_jsonb(matchday) order by matchday.id)
          from tournament_matchday matchday where matchday.tournament_id = $1), '[]'::jsonb),
       'rounds', coalesce((select jsonb_agg(to_jsonb(round) order by round.id)
          from tournament_round round where round.tournament_id = $1), '[]'::jsonb),
       'fixtures', coalesce((select jsonb_agg(to_jsonb(fixture) order by fixture.id)
          from tournament_fixture fixture where fixture.tournament_id = $1), '[]'::jsonb),
       'series', coalesce((select jsonb_agg(to_jsonb(series) order by series.id)
          from tournament_playoff_series series where series.tournament_id = $1), '[]'::jsonb),
       'results', coalesce((select jsonb_agg(to_jsonb(result) order by result.id)
          from tournament_daily_result result where result.tournament_id = $1), '[]'::jsonb)
     ) as fingerprint`,
    [tournamentId],
  );
  return result.rows[0]!.fingerprint;
}

async function automaticMarker(pool: Pool, tournamentId: string): Promise<number | null> {
  const result = await pool.query<{ marker: number | null }>(
    `select (rules_snapshot->>'automaticLifecycleVersion')::int as marker
       from tournament_revision
      where id = (select published_revision_id from tournament where id = $1)`,
    [tournamentId],
  );
  return result.rows[0]?.marker ?? null;
}

describe.skipIf(!hasIntegrationEnv)('automatic tournament lifecycle audit', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createTestPool();
    getTestUrls();
  });

  beforeEach(async () => {
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    await pool.query(
      `insert into users (id, display_name, timezone, role)
       values ($1, 'Creator', 'Europe/Moscow', 'admin')`,
      [CREATOR_ID],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('does not mutate a legacy tournament during dry-run', async () => {
    const legacy = await seedLegacyTournament(pool, 'legacy-audit-dry-run');
    const before = await tournamentFingerprint(pool, legacy.id);

    const report = await auditAutomaticTournamentLifecycle(pool, {
      tournamentId: legacy.id,
      now: NOW,
      apply: false,
    });

    expect(report.tournaments[0]).toMatchObject({ status: 'ready_to_enable' });
    expect(await tournamentFingerprint(pool, legacy.id)).toEqual(before);
  });

  it('blocks a legacy tournament with played or conflicting schedule data', async () => {
    const conflicted = await seedLegacyTournament(pool, 'legacy-audit-conflicted');
    await generateRegularSchedule(pool, conflicted.id, 1);
    await pool.query(
      `update tournament_fixture set status = 'active'
        where id = (select id from tournament_fixture where tournament_id = $1 order by id limit 1)`,
      [conflicted.id],
    );

    const report = await auditAutomaticTournamentLifecycle(pool, {
      tournamentId: conflicted.id,
      now: NOW,
      apply: true,
    });

    expect(report.tournaments[0]).toMatchObject({
      status: 'blocked',
      reasons: expect.arrayContaining(['games_already_started']),
    });
    expect(await automaticMarker(pool, conflicted.id)).toBeNull();
  });

  it('enables a safe tournament and reconciles it once', async () => {
    const safe = await seedLegacyTournament(pool, 'legacy-audit-safe');

    const report = await auditAutomaticTournamentLifecycle(pool, {
      tournamentId: safe.id,
      now: NOW,
      apply: true,
    });

    expect(report.tournaments[0]).toMatchObject({
      status: 'enabled',
      reconcile: { scanned: 1, changed: 0 },
    });
    expect(await automaticMarker(pool, safe.id)).toBe(1);
  });

  it('blocks a legacy tournament whose regular season has already started', async () => {
    const elapsed = await seedLegacyTournament(pool, 'legacy-audit-elapsed-regular');
    await pool.query(`update tournament set starts_at = $2 where id = $1`, [
      elapsed.id,
      new Date('2030-09-01T11:59:00.000Z'),
    ]);

    const report = await auditAutomaticTournamentLifecycle(pool, {
      tournamentId: elapsed.id,
      now: NOW,
      apply: true,
    });

    expect(report.tournaments[0]).toMatchObject({
      status: 'blocked',
      reasons: expect.arrayContaining(['regular_schedule_already_started']),
    });
    expect(await automaticMarker(pool, elapsed.id)).toBeNull();
  });

  it('blocks a legacy daily aggregate tournament with a persisted daily result', async () => {
    const daily = await seedLegacyTournament(pool, 'legacy-audit-daily-result', {
      source: 'daily_aggregate',
    });
    const participant = await pool.query<{ id: string }>(
      `select id from tournament_participant where tournament_id = $1 order by id limit 1`,
      [daily.id],
    );
    await pool.query(
      `insert into tournament_daily_result
         (tournament_id, participant_id, tournament_day, player_local_date, goals, shots,
          accuracy, completed, finalized_at)
       values ($1, $2, 1, '2030-09-02', 1, 2, 0.5, true, $3)`,
      [daily.id, participant.rows[0]!.id, NOW],
    );

    const report = await auditAutomaticTournamentLifecycle(pool, {
      tournamentId: daily.id,
      now: NOW,
      apply: true,
    });

    expect(report.tournaments[0]).toMatchObject({
      status: 'blocked',
      completedGameCount: expect.any(Number),
      reasons: expect.arrayContaining(['games_already_started']),
    });
    expect(report.tournaments[0]!.completedGameCount).toBeGreaterThan(0);
    expect(await automaticMarker(pool, daily.id)).toBeNull();
  });

  it('enables only fully completed legacy daily seasons for automatic playoff recovery', async () => {
    const complete = await seedLegacyTournament(pool, 'legacy-audit-daily-complete', {
      source: 'daily_aggregate',
    });
    const partial = await seedLegacyTournament(pool, 'legacy-audit-daily-partial', {
      source: 'daily_aggregate',
      userIdOffset: 100,
    });
    for (const tournamentId of [complete.id, partial.id]) {
      await generateRegularSchedule(pool, tournamentId, 1);
      await publishRegularSchedule(pool, tournamentId);
    }
    const participants = await pool.query<{ id: string }>(
      `select id from tournament_participant where tournament_id = $1 order by id`,
      [complete.id],
    );
    for (const [participantIndex, participant] of participants.rows.entries()) {
      for (let day = 1; day <= 3; day += 1) {
        await pool.query(
          `insert into tournament_daily_result
             (tournament_id, participant_id, tournament_day, player_local_date, goals, shots,
              accuracy, completed, finalized_at)
           values ($1, $2, $3, $4, $5, 10, $6, true, $7)`,
          [
            complete.id,
            participant.id,
            day,
            `2030-09-0${3 + day}`,
            participantIndex + day,
            (participantIndex + day) / 10,
            NOW,
          ],
        );
      }
    }
    const partialParticipant = await pool.query<{ id: string }>(
      `select id from tournament_participant where tournament_id = $1 order by id limit 1`,
      [partial.id],
    );
    await pool.query(
      `insert into tournament_daily_result
         (tournament_id, participant_id, tournament_day, player_local_date, goals, shots,
          accuracy, completed, finalized_at)
       values ($1, $2, 1, '2030-09-04', 1, 3, $3, true, $4)`,
      [partial.id, partialParticipant.rows[0]!.id, 1 / 3, NOW],
    );

    const report = await auditCompletedLegacyDailyTournamentLifecycle(pool, {
      now: NOW,
      apply: true,
    });

    expect(report.tournaments).toHaveLength(1);
    expect(report.tournaments[0]).toMatchObject({ id: complete.id, status: 'enabled' });
    expect(await automaticMarker(pool, complete.id)).toBe(1);
    expect(await automaticMarker(pool, partial.id)).toBeNull();
  });

  it('blocks a legacy Classic tournament with a persisted session and period', async () => {
    const classic = await seedLegacyTournament(pool, 'legacy-audit-classic-session', {
      source: 'classic',
    });
    await generateRegularSchedule(pool, classic.id, 1);
    const context = await pool.query<{ participant_id: string; matchday_id: string }>(
      `select participant.id as participant_id, matchday.id as matchday_id
         from tournament_participant participant
         join tournament_matchday matchday on matchday.tournament_id = participant.tournament_id
        where participant.tournament_id = $1
        order by participant.id, matchday.number
        limit 1`,
      [classic.id],
    );
    const session = await pool.query<{ id: string }>(
      `insert into tournament_classic_session
         (tournament_id, participant_id, matchday_id, tournament_day, state, current_period,
          rules_snapshot, game_core_version, session_seed, closes_at, closed_at)
       values ($1, $2, $3, 1, 'closed', 1, '{}'::jsonb, 1, 'legacy-session', $4, $4)
       returning id`,
      [classic.id, context.rows[0]!.participant_id, context.rows[0]!.matchday_id, NOW],
    );
    await pool.query(
      `insert into tournament_classic_period
         (session_id, period_number, started_at, ended_at, shots_taken, goals, closed_reason)
       values ($1, 1, $2, $2, 2, 1, 'quota')`,
      [session.rows[0]!.id, NOW],
    );

    const report = await auditAutomaticTournamentLifecycle(pool, {
      tournamentId: classic.id,
      now: NOW,
      apply: true,
    });

    expect(report.tournaments[0]).toMatchObject({
      status: 'blocked',
      reasons: expect.arrayContaining(['games_already_started']),
    });
    expect(report.tournaments[0]!.completedGameCount).toBeGreaterThan(0);
    expect(await automaticMarker(pool, classic.id)).toBeNull();
  });

  it('blocks a head-to-head schedule with a duplicate pair and a missing pair', async () => {
    const tournament = await seedLegacyTournament(pool, 'legacy-audit-duplicate-pair');
    await generateRegularSchedule(pool, tournament.id, 1);
    await pool.query(
      `with first_round as (
         select fixture.id, fixture.home_participant_id, fixture.away_participant_id,
                row_number() over (order by fixture.fixture_number) as position
           from tournament_fixture fixture
           join tournament_round round_row on round_row.id = fixture.round_id
          where fixture.tournament_id = $1 and round_row.number = 1
       ), source as (
         select home_participant_id, away_participant_id from first_round where position = 1
       )
       update tournament_fixture fixture
          set home_participant_id = source.home_participant_id,
              away_participant_id = source.away_participant_id
         from first_round target, source
        where fixture.id = target.id and target.position = 2`,
      [tournament.id],
    );

    const report = await auditAutomaticTournamentLifecycle(pool, {
      tournamentId: tournament.id,
      now: NOW,
      apply: true,
    });

    expect(report.tournaments[0]).toMatchObject({
      status: 'blocked',
      reasons: expect.arrayContaining(['schedule_conflicts_with_published_configuration']),
    });
    expect(await automaticMarker(pool, tournament.id)).toBeNull();
  });

  it('blocks a head-to-head schedule whose persisted bye differs from the published plan', async () => {
    const tournament = await seedLegacyTournament(pool, 'legacy-audit-wrong-bye', {
      participantCount: 3,
      playoffSize: 2,
    });
    await generateRegularSchedule(pool, tournament.id, 1);
    await pool.query(
      `update tournament_round
          set rules_snapshot = jsonb_build_object('byeParticipantId', '00000000-0000-4000-8000-000000009999')
        where id = (
          select id from tournament_round
           where tournament_id = $1 and stage = 'regular'
           order by number limit 1
        )`,
      [tournament.id],
    );

    const report = await auditAutomaticTournamentLifecycle(pool, {
      tournamentId: tournament.id,
      now: NOW,
      apply: true,
    });

    expect(report.tournaments[0]).toMatchObject({
      status: 'blocked',
      reasons: expect.arrayContaining(['schedule_conflicts_with_published_configuration']),
    });
    expect(await automaticMarker(pool, tournament.id)).toBeNull();
  });
});
