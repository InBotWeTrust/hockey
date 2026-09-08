import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool, PoolClient } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createJwt } from '../../src/auth/jwt.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { getGameplayLockState, lockUserGameplay } from '../../src/duel/gameplayLocks.js';
import {
  finalizeDueClassicTournamentDays,
  getClassicGameState,
  listActiveClassicGames,
  startClassicGamePeriod,
  submitClassicGameShot,
} from '../../src/tournament/classicGame.js';
import { parseTournamentConfig } from '../../src/tournament/config.js';
import { getTournamentStandings } from '../../src/tournament/service.js';
import {
  createTestPool,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
} from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const ADMIN_ID = '00000000-0000-4000-8000-000000000801';
const PLAYER_ID = '00000000-0000-4000-8000-000000000802';
const TOURNAMENT_ID = '00000000-0000-4000-8000-000000000803';
const PARTICIPANT_ID = '00000000-0000-4000-8000-000000000804';
const MATCHDAY_ID = '00000000-0000-4000-8000-000000000805';
const REVISION_ID = '00000000-0000-4000-8000-000000000806';
const SECOND_PLAYER_ID = '00000000-0000-4000-8000-000000000807';
const SECOND_PARTICIPANT_ID = '00000000-0000-4000-8000-000000000808';
const NOW = new Date('2030-09-01T10:00:00.000Z');
const SEED_SECRET = 'classic-integration-seed-secret';
const JWT_SECRET = 'classic-game-route-access-secret';
const REFRESH_SECRET = 'classic-game-route-refresh-secret';

function classicConfig() {
  return parseTournamentConfig({
    regularSource: 'classic',
    participantLimit: 8,
    playoffSize: 4,
    timezone: 'Europe/Moscow',
    registrationMode: 'open',
    visibility: 'public',
    entryFeeCoins: 0,
    roundRobinCycles: null,
    roundsPerDay: null,
    firstRoundLocalTime: null,
    fixtureWindowMs: null,
    roundBreakMs: null,
    dailyDays: 1,
    dailyMetric: 'goals_sum',
    bestDays: null,
    classicRules: {
      shotsPerPeriod: 1,
      periodDurationMs: 60_000,
      breakDurationMs: 0,
      incompleteResultPolicy: 'completed_game',
      periodSpeedPresets: [
        {
          periodNumber: 1,
          goalFrequency: 0.55,
          goalieFrequency: 0.65,
          shooterFrequency: 0.8,
          puckSpeedPerMs: 1.3,
        },
        {
          periodNumber: 2,
          goalFrequency: 0.72,
          goalieFrequency: 0.84,
          shooterFrequency: 1,
          puckSpeedPerMs: 1.55,
        },
        {
          periodNumber: 3,
          goalFrequency: 0.9,
          goalieFrequency: 1.05,
          shooterFrequency: 1.18,
          puckSpeedPerMs: 1.8,
        },
      ],
    },
  });
}

async function seedClassicTournament(pool: Pool) {
  await pool.query(
    `insert into users (id, display_name, timezone, role, level)
     values ($1, 'Admin', 'Europe/Moscow', 'admin', 10),
            ($2, 'Игрок', 'Europe/Moscow', 'player', 2)`,
    [ADMIN_ID, PLAYER_ID],
  );
  await pool.query(
    `insert into game_settings (key, value, label, description)
     values ('tournaments.enabled', 'true'::jsonb, 'Турниры включены', 'test')
     on conflict (key) do update set value = excluded.value`,
  );
  const rules = {
    config: classicConfig(),
    eligibility: {
      minLevel: null,
      maxLevel: null,
      minGoals: 0,
      minExperience: 0,
      invitedUserIds: [],
      bannedUserIds: [],
    },
  };
  await pool.query(
    `insert into tournament
       (id, slug, title, status, regular_source, current_revision, starts_at, created_by)
     values ($1, 'classic-cup', 'Кубок классики', 'regular', 'classic', 1, $2, $3)`,
    [TOURNAMENT_ID, NOW, ADMIN_ID],
  );
  await pool.query(
    `insert into tournament_revision
       (id, tournament_id, revision, rules_snapshot, is_published, created_by, published_at)
     values ($1, $2, 1, $3, true, $4, $5)`,
    [REVISION_ID, TOURNAMENT_ID, JSON.stringify(rules), ADMIN_ID, NOW],
  );
  await pool.query(`update tournament set published_revision_id = $2 where id = $1`, [
    TOURNAMENT_ID,
    REVISION_ID,
  ]);
  await pool.query(
    `insert into tournament_participant
       (id, tournament_id, user_id, state, joined_at)
     values ($1, $2, $3, 'approved', $4)`,
    [PARTICIPANT_ID, TOURNAMENT_ID, PLAYER_ID, NOW],
  );
  await pool.query(
    `insert into tournament_matchday
       (id, tournament_id, number, local_date, starts_at, ends_at, status)
     values ($1, $2, 1, '2030-09-01', $3, $4, 'open')`,
    [MATCHDAY_ID, TOURNAMENT_ID, NOW, new Date('2030-09-01T20:59:59.999Z')],
  );
}

async function configureIncompleteGamePolicy(
  pool: Pool,
  policy: 'all_shots' | 'completed_periods' | 'completed_game',
): Promise<void> {
  await pool.query(
    `update tournament_revision
        set rules_snapshot = jsonb_set(
          jsonb_set(
            rules_snapshot,
            '{config,classicRules,incompleteResultPolicy}',
            to_jsonb($2::text)
          ),
          '{config,classicRules,shotsPerPeriod}',
          '2'::jsonb
        )
      where id = $1`,
    [REVISION_ID, policy],
  );
}

async function submitMiss(pool: Pool, shotIndex: number, now: Date): Promise<void> {
  vi.setSystemTime(now);
  await submitClassicGameShot(pool, {
    userId: PLAYER_ID,
    tournamentId: TOURNAMENT_ID,
    now,
    seedSecret: SEED_SECRET,
    shotIndex,
    input: { tapTime: 0 },
    claimedResult: 'miss',
  });
}

async function seedRecentTrainingShot(pool: Pool, createdAt: Date): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into training_session
       (user_id, day_date, selected_period, state, game_core_version, training_seed, started_at)
     values ($1, '2030-09-01', 1, 'active', 1, 'training-seed', $2)
     returning id`,
    [PLAYER_ID, createdAt],
  );
  await pool.query(
    `insert into shot_session
       (user_id, mode, training_session_id, period_number, shot_index, seed,
        input_payload, server_result, game_core_version, created_at)
     values ($1, 'training', $2, 1, 1, 'shot-seed', '{}'::jsonb, 'miss', 1, $3)`,
    [PLAYER_ID, rows[0]!.id, createdAt],
  );
}

async function seedClassicShotStick(pool: Pool, chargesAvailable: number): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `update admin_inventory_items
        set duel_period_cost = 0,
            resource_unit = 'shot',
            effect_puck_speed_points = 10,
            effect_puck_speed_delta = 0.1
      where id = (
        select id from admin_inventory_items
         where item_kind = 'stick' and deleted_at is null
         order by id limit 1
      )
      returning id`,
  );
  const itemId = rows[0]!.id;
  await pool.query(
    `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
     values ($1, $2, $3)`,
    [PLAYER_ID, itemId, chargesAvailable],
  );
  await pool.query(
    `insert into user_equipment (user_id, equipped_stick_item_id)
     values ($1, $2)
     on conflict (user_id) do update set equipped_stick_item_id = excluded.equipped_stick_item_id`,
    [PLAYER_ID, itemId],
  );
  return itemId;
}

async function seedClassicConditionItem(
  pool: Pool,
  kind: 'skates' | 'nutrition',
  chargesAvailable: number,
): Promise<string> {
  const resourceUnit = kind === 'skates' ? 'distance' : 'energy_ms';
  const { rows } = await pool.query<{ id: string }>(
    `update admin_inventory_items
        set duel_period_cost = 0, resource_unit = $2
      where id = (
        select id from admin_inventory_items
         where item_kind = $1 and deleted_at is null
         order by id limit 1
      )
      returning id`,
    [kind, resourceUnit],
  );
  const itemId = rows[0]!.id;
  await pool.query(
    `insert into user_inventory_item (user_id, inventory_item_id, charges_available)
     values ($1, $2, $3)`,
    [PLAYER_ID, itemId, chargesAvailable],
  );
  return itemId;
}

async function waitForAdvisoryWaiter(pool: Pool, minimumWaiting = 1): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { rows } = await pool.query<{ waiting: number }>(
      `select count(*)::int as waiting
         from pg_locks
        where locktype = 'advisory'
          and not granted
          and database = (select oid from pg_database where datname = current_database())`,
    );
    if ((rows[0]?.waiting ?? 0) >= minimumWaiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('timed out waiting for Classic gameplay advisory lock contention');
}

async function seedScheduledFixture(pool: Pool, startsAt: Date): Promise<void> {
  await pool.query(
    `with cup as (
       insert into tournament (slug, title, status, regular_source, created_by)
       values ('scheduled-race-cup', 'Scheduled race cup', 'regular', 'head_to_head', $1) returning id
     ), home as (
       insert into tournament_participant (tournament_id, user_id, state)
       select id, $2, 'approved' from cup returning id
     ), away as (
       insert into tournament_participant (tournament_id, user_id, state)
       select id, $1, 'approved' from cup returning id
     ), round as (
       insert into tournament_round (tournament_id, stage, number, status)
       select id, 'regular', 1, 'open' from cup returning id
     )
     insert into tournament_fixture
       (tournament_id, round_id, fixture_number, home_participant_id,
        away_participant_id, scheduled_starts_at, window_ends_at, status)
     select cup.id, round.id, 1, home.id, away.id, $3, $3::timestamptz + interval '1 hour', 'scheduled'
     from cup, round, home, away`,
    [ADMIN_ID, PLAYER_ID, startsAt],
  );
}

describe.skipIf(!hasIntegrationEnv)('classic tournament game integration', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  beforeEach(async () => {
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
    await seedClassicTournament(pool);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => vi.useRealTimers());

  afterAll(async () => {
    await pool.end();
  });

  it('creates one resumable session and exposes it on the active-games board', async () => {
    const first = await getClassicGameState(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
    });
    const second = await getClassicGameState(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
    });
    const active = await listActiveClassicGames(pool, { userId: PLAYER_ID, now: NOW });

    expect(second.session_id).toBe(first.session_id);
    expect(active).toEqual([
      expect.objectContaining({
        tournament_id: TOURNAMENT_ID,
        tournament_title: 'Кубок классики',
        tournament_day: 1,
        state: 'idle',
      }),
    ]);
    const sessions = await pool.query(`select id from tournament_classic_session`);
    expect(sessions.rowCount).toBe(1);
  });

  it('does not activate the Classic gameplay lock before the first accepted shot', async () => {
    await getClassicGameState(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
    });
    await expect(
      getGameplayLockState(pool as unknown as PoolClient, {
        userId: PLAYER_ID,
        action: 'start_training',
        now: NOW,
      }),
    ).resolves.toMatchObject({ blocked: false });

    await startClassicGamePeriod(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
    });

    await expect(
      getGameplayLockState(pool as unknown as PoolClient, {
        userId: PLAYER_ID,
        action: 'start_training',
        now: NOW,
      }),
    ).resolves.toMatchObject({ blocked: false });
  });

  it('keeps an accepted Classic game locked beyond one hour until all periods complete', async () => {
    await startClassicGamePeriod(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
    });
    await submitMiss(pool, 1, NOW);

    for (const now of [NOW, new Date(NOW.getTime() + 61 * 60_000)]) {
      await expect(
        getGameplayLockState(pool as unknown as PoolClient, {
          userId: PLAYER_ID,
          action: 'start_training',
          now,
        }),
      ).resolves.toEqual({ blocked: true, reason: 'active_classic', endsAt: null });
    }

    for (let period = 2; period <= 3; period += 1) {
      const now = new Date(NOW.getTime() + period);
      await startClassicGamePeriod(pool, {
        userId: PLAYER_ID,
        tournamentId: TOURNAMENT_ID,
        now,
        seedSecret: SEED_SECRET,
      });
      await submitMiss(pool, 1, now);
    }

    await expect(
      getGameplayLockState(pool as unknown as PoolClient, {
        userId: PLAYER_ID,
        action: 'start_training',
        now: new Date(NOW.getTime() + 3),
      }),
    ).resolves.toEqual({ blocked: false, reason: null, endsAt: null });
  });

  it('uses a partial shot-stick balance and continues with the base stick after depletion', async () => {
    const stickId = await seedClassicShotStick(pool, 1);
    await pool.query(
      `update tournament_revision
          set rules_snapshot = jsonb_set(
            rules_snapshot, '{config,classicRules,shotsPerPeriod}', '2'::jsonb
          )
        where id = $1`,
      [REVISION_ID],
    );

    const initial = await getClassicGameState(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
    });
    expect(initial.loadout.items).toEqual([
      expect.objectContaining({ itemId: stickId, kind: 'stick', resourceAvailable: 1 }),
    ]);
    expect(initial.loadout_editable).toBe(true);

    await startClassicGamePeriod(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
      loadout: { stick: stickId },
    });
    await submitClassicGameShot(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
      shotIndex: 1,
      input: { tapTime: 0 },
      claimedResult: 'miss',
    });
    await submitClassicGameShot(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: new Date(NOW.getTime() + 1),
      seedSecret: SEED_SECRET,
      shotIndex: 2,
      input: { tapTime: 1 },
      claimedResult: 'miss',
    });

    const shots = await pool.query<{ puck_speed: number }>(
      `select (input_payload->>'puckSpeedPerMs')::double precision as puck_speed
         from shot_session
        where tournament_classic_session_id = $1
        order by shot_index`,
      [initial.session_id],
    );
    expect(shots.rows[0]!.puck_speed).toBeCloseTo(1.4, 8);
    expect(shots.rows[1]!.puck_speed).toBeCloseTo(1.3, 8);
  });

  it('does not block a classic period when the equipped inventory is empty', async () => {
    const stickId = await seedClassicShotStick(pool, 0);
    const started = await startClassicGamePeriod(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
      loadout: { stick: stickId },
    });
    expect(started.state).toBe('period_active');

    await submitClassicGameShot(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
      shotIndex: 1,
      input: { tapTime: 0 },
      claimedResult: 'miss',
    });
    const stored = await pool.query<{ puck_speed: number }>(
      `select (input_payload->>'puckSpeedPerMs')::double precision as puck_speed
         from shot_session where tournament_classic_session_id = $1`,
      [started.session_id],
    );
    expect(stored.rows[0]!.puck_speed).toBeCloseTo(1.3, 8);
  });

  it('snapshots the selected inventory timing configured in the admin catalog', async () => {
    const stickId = await seedClassicShotStick(pool, 1);
    await pool.query(
      `update admin_inventory_items
          set effect_fatigue_delay_ms = 12345,
              effect_stumble_interval_min_ms = 23456
        where id = $1`,
      [stickId],
    );

    const started = await startClassicGamePeriod(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
      loadout: { stick: stickId },
    });

    expect(started.loadout.items[0]).toEqual(
      expect.objectContaining({
        timing: expect.objectContaining({
          fatigueDelayMs: 12345,
          stumbleIntervalMinMs: 23456,
        }),
      }),
    );
  });

  it('charges skates and nutrition only for the activity actually completed', async () => {
    const skatesId = await seedClassicConditionItem(pool, 'skates', 100);
    const nutritionId = await seedClassicConditionItem(pool, 'nutrition', 10_000);
    const started = await startClassicGamePeriod(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
      loadout: { skates: skatesId, nutrition: nutritionId },
    });

    const shot = await submitClassicGameShot(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: new Date(NOW.getTime() + 1_000),
      seedSecret: SEED_SECRET,
      shotIndex: 1,
      input: { tapTime: 1_000 },
      claimedResult: 'miss',
    });

    expect(shot.state.inventory_consumption).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemId: skatesId, charges: 1.6 }),
        expect.objectContaining({ itemId: nutritionId, charges: 1067 }),
      ]),
    );
    const balances = await pool.query<{ inventory_item_id: string; charges_available: number }>(
      `select inventory_item_id, charges_available
         from user_inventory_item
        where user_id = $1 and inventory_item_id = any($2::uuid[])
        order by inventory_item_id`,
      [PLAYER_ID, [skatesId, nutritionId]],
    );
    expect(
      new Map(balances.rows.map((row) => [row.inventory_item_id, row.charges_available])),
    ).toEqual(
      new Map([
        [skatesId, 99],
        [nutritionId, 8933],
      ]),
    );
    expect(started.inventory_consumption).toEqual([]);
  });

  it('charges movement and energy accumulated after the final classic shot when the period closes', async () => {
    const skatesId = await seedClassicConditionItem(pool, 'skates', 100);
    const nutritionId = await seedClassicConditionItem(pool, 'nutrition', 10_000);
    await pool.query(
      `update tournament_revision
          set rules_snapshot = jsonb_set(
            jsonb_set(
              rules_snapshot, '{config,classicRules,periodDurationMs}', '2000'::jsonb
            ),
            '{config,classicRules,shotsPerPeriod}', '2'::jsonb
          )
        where id = $1`,
      [REVISION_ID],
    );
    const started = await startClassicGamePeriod(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
      loadout: { skates: skatesId, nutrition: nutritionId },
    });

    await submitClassicGameShot(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: new Date(NOW.getTime() + 1_000),
      seedSecret: SEED_SECRET,
      shotIndex: 1,
      input: { tapTime: 1_000 },
      claimedResult: 'miss',
    });
    const closed = await getClassicGameState(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: new Date(NOW.getTime() + 2_000),
      seedSecret: SEED_SECRET,
    });

    expect(closed.inventory_consumption).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemId: skatesId, charges: 3.2 }),
        expect.objectContaining({ itemId: nutritionId, charges: 2134 }),
      ]),
    );
    const balances = await pool.query<{ inventory_item_id: string; charges_available: number }>(
      `select inventory_item_id, charges_available
         from user_inventory_item
        where user_id = $1 and inventory_item_id = any($2::uuid[])`,
      [PLAYER_ID, [skatesId, nutritionId]],
    );
    expect(
      new Map(balances.rows.map((row) => [row.inventory_item_id, row.charges_available])),
    ).toEqual(
      new Map([
        [skatesId, 97],
        [nutritionId, 7866],
      ]),
    );
    expect(started.inventory_consumption).toEqual([]);
  });

  it('keeps a started period loadout immutable and accepts a new selection after the break', async () => {
    const stickId = await seedClassicShotStick(pool, 2);
    const first = await startClassicGamePeriod(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
      loadout: { stick: stickId },
    });
    await expect(
      startClassicGamePeriod(pool, {
        userId: PLAYER_ID,
        tournamentId: TOURNAMENT_ID,
        now: NOW,
        seedSecret: SEED_SECRET,
        loadout: { stick: null },
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await submitClassicGameShot(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
      shotIndex: 1,
      input: { tapTime: 0 },
      claimedResult: 'miss',
    });
    await startClassicGamePeriod(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: new Date(NOW.getTime() + 1),
      seedSecret: SEED_SECRET,
      loadout: { stick: null },
    });
    const snapshots = await pool.query<{ period_number: number; snapshot: { items: unknown[] } }>(
      `select period_number, snapshot from tournament_classic_period_loadout
        where session_id = $1 order by period_number`,
      [first.session_id],
    );
    expect(snapshots.rows.map((row) => [row.period_number, row.snapshot.items.length])).toEqual([
      [1, 1],
      [2, 0],
    ]);
  });

  it('exposes the current break deadline on the active-games board', async () => {
    const state = await getClassicGameState(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
    });
    await pool.query(
      `update tournament_classic_session
          set state = 'break_active', current_period = 1, break_started_at = $2,
              rules_snapshot = jsonb_set(rules_snapshot, '{breakDurationMs}', '300000'::jsonb)
        where id = $1`,
      [state.session_id, NOW],
    );

    const active = await listActiveClassicGames(pool, { userId: PLAYER_ID, now: NOW });

    expect(active[0]).toEqual(
      expect.objectContaining({
        state: 'break_active',
        break_ends_at: new Date(NOW.getTime() + 5 * 60_000).toISOString(),
      }),
    );
  });

  it('does not duplicate a session or shot when requests arrive together', async () => {
    const states = await Promise.all([
      getClassicGameState(pool, {
        userId: PLAYER_ID,
        tournamentId: TOURNAMENT_ID,
        now: NOW,
        seedSecret: SEED_SECRET,
      }),
      getClassicGameState(pool, {
        userId: PLAYER_ID,
        tournamentId: TOURNAMENT_ID,
        now: NOW,
        seedSecret: SEED_SECRET,
      }),
    ]);
    expect(new Set(states.map((state) => state.session_id)).size).toBe(1);

    await startClassicGamePeriod(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
    });
    const shots = await Promise.allSettled([
      submitClassicGameShot(pool, {
        userId: PLAYER_ID,
        tournamentId: TOURNAMENT_ID,
        now: NOW,
        seedSecret: SEED_SECRET,
        shotIndex: 1,
        input: { tapTime: 0 },
        claimedResult: 'miss',
      }),
      submitClassicGameShot(pool, {
        userId: PLAYER_ID,
        tournamentId: TOURNAMENT_ID,
        now: NOW,
        seedSecret: SEED_SECRET,
        shotIndex: 1,
        input: { tapTime: 0 },
        claimedResult: 'miss',
      }),
    ]);

    expect(shots.filter((shot) => shot.status === 'fulfilled')).toHaveLength(1);
    expect(shots.filter((shot) => shot.status === 'rejected')).toHaveLength(1);
    expect(
      await pool.query(`select id from tournament_classic_session where tournament_id = $1`, [
        TOURNAMENT_ID,
      ]),
    ).toMatchObject({ rowCount: 1 });
    expect(
      await pool.query(`select id from shot_session where mode = 'tournament_classic'`),
    ).toMatchObject({ rowCount: 1 });
    expect(
      await pool.query(`select lifetime_shots_total from users where id = $1`, [PLAYER_ID]),
    ).toMatchObject({ rows: [{ lifetime_shots_total: 1 }] });
  });

  it('plays three one-shot periods, updates lifetime totals and records one tournament result', async () => {
    let now = NOW;
    for (let period = 1; period <= 3; period += 1) {
      const started = await startClassicGamePeriod(pool, {
        userId: PLAYER_ID,
        tournamentId: TOURNAMENT_ID,
        now,
        seedSecret: SEED_SECRET,
      });
      expect(started.current_period).toBe(period);

      const submitted = await submitClassicGameShot(pool, {
        userId: PLAYER_ID,
        tournamentId: TOURNAMENT_ID,
        now,
        seedSecret: SEED_SECRET,
        shotIndex: 1,
        input: { tapTime: 0 },
        claimedResult: 'miss',
      });
      expect(submitted.state.current_period).toBe(period);
      now = new Date(now.getTime() + 1);
    }

    const state = await getClassicGameState(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now,
      seedSecret: SEED_SECRET,
    });
    expect(state.state).toBe('closed');
    expect(state.daily_total_shots).toBe(3);

    const user = await pool.query<{ shots: number; goals: number }>(
      `select lifetime_shots_total as shots, lifetime_goals_total as goals
         from users where id = $1`,
      [PLAYER_ID],
    );
    const result = await pool.query<{ shots: number; completed: boolean }>(
      `select shots, completed from tournament_daily_result
        where tournament_id = $1 and participant_id = $2 and tournament_day = 1`,
      [TOURNAMENT_ID, PARTICIPANT_ID],
    );
    expect(user.rows[0]!.shots).toBe(3);
    expect(result.rows).toEqual([{ shots: 3, completed: true }]);
    expect((await pool.query(`select id from day_pool`)).rowCount).toBe(0);
  });

  it('rebuilds existing tied classic standings with the faster player first', async () => {
    await pool.query(
      `insert into users (id, display_name, timezone, role, level)
       values ($1, 'Быстрый игрок', 'Europe/Moscow', 'player', 2)`,
      [SECOND_PLAYER_ID],
    );
    await pool.query(
      `insert into tournament_participant (id, tournament_id, user_id, state, joined_at)
       values ($1, $2, $3, 'approved', $4)`,
      [SECOND_PARTICIPANT_ID, TOURNAMENT_ID, SECOND_PLAYER_ID, NOW],
    );
    const slowSessionId = '00000000-0000-4000-8000-000000000809';
    const fastSessionId = '00000000-0000-4000-8000-000000000810';
    for (const [sessionId, participantId, durationMs] of [
      [slowSessionId, PARTICIPANT_ID, 240_000],
      [fastSessionId, SECOND_PARTICIPANT_ID, 180_000],
    ] as const) {
      await pool.query(
        `insert into tournament_classic_session
           (id, tournament_id, participant_id, matchday_id, tournament_day, state,
            current_period, rules_snapshot, game_core_version, session_seed, closes_at, closed_at)
         values ($1, $2, $3, $4, 1, 'closed', 3, $5, 1, $6, $7, $7)`,
        [
          sessionId,
          TOURNAMENT_ID,
          participantId,
          MATCHDAY_ID,
          JSON.stringify(classicConfig().classicRules),
          `seed-${sessionId}`,
          new Date(NOW.getTime() + durationMs),
        ],
      );
      await pool.query(
        `insert into tournament_classic_period
           (session_id, period_number, started_at, ended_at, shots_taken, goals, closed_reason)
         values ($1, 1, $2, $3, 90, 78, 'quota')`,
        [sessionId, NOW, new Date(NOW.getTime() + durationMs)],
      );
      await pool.query(
        `insert into tournament_daily_result
           (tournament_id, participant_id, tournament_day, player_local_date,
            goals, shots, accuracy, place_points, completed, source_snapshot, finalized_at)
         values ($1, $2, 1, '2030-09-01', 78, 90, 78.0 / 90.0, 0, true, $3, $4)`,
        [
          TOURNAMENT_ID,
          participantId,
          JSON.stringify({
            source: 'tournament_classic',
            sessionId,
            gameCompleted: true,
            incompleteResultPolicy: 'completed_game',
          }),
          new Date(NOW.getTime() + durationMs),
        ],
      );
    }

    await getTournamentStandings(pool, TOURNAMENT_ID);

    const standings = await pool.query<{
      user_id: string;
      rank: number;
      total_duration_ms: number;
    }>(
      `select participant.user_id, standing.rank,
              (standing.metrics->>'totalDurationMs')::int as total_duration_ms
         from tournament_standing standing
         join tournament_participant participant on participant.id = standing.participant_id
        where standing.tournament_id = $1
        order by standing.rank`,
      [TOURNAMENT_ID],
    );
    expect(standings.rows).toEqual([
      { user_id: SECOND_PLAYER_ID, rank: 1, total_duration_ms: 180_000 },
      { user_id: PLAYER_ID, rank: 2, total_duration_ms: 240_000 },
    ]);
  });

  it('runs tournament lifecycle only after the classic game becomes terminal', async () => {
    const { databaseUrl, redisUrl } = getTestUrls();
    const app = await buildApp({
      config: {
        NODE_ENV: 'test',
        HOST: '0.0.0.0',
        PORT: 3000,
        LOG_LEVEL: 'warn',
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        JWT_SECRET,
        REFRESH_SECRET,
        TELEGRAM_BOT_TOKEN: 'classic-game-route-bot-token',
        DAILY_SEED_SECRET: SEED_SECRET,
      },
      pushSchedulerEnabled: false,
      pushWorkerEnabled: false,
      tournamentLifecycleEnabled: false,
    });
    await app.ready();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const authorization = `Bearer ${await jwt.issueAccessToken({ sub: PLAYER_ID })}`;
    const reconcile = vi.spyOn(app, 'reconcileTournamentLifecycleBestEffort');
    try {
      const malformed = await app.inject({
        method: 'POST',
        url: `/tournaments/${TOURNAMENT_ID}/classic/period/start`,
        headers: { authorization },
        payload: { loadout: { stick: 'not-a-uuid' } },
      });
      expect(malformed.statusCode).toBe(400);

      for (let period = 1; period <= 3; period += 1) {
        const started = await app.inject({
          method: 'POST',
          url: `/tournaments/${TOURNAMENT_ID}/classic/period/start`,
          headers: { authorization },
          ...(period === 1
            ? { payload: { loadout: { stick: null, skates: null, nutrition: null } } }
            : {}),
        });
        expect(started.statusCode).toBe(200);
        if (period === 1) {
          const periodLoadout = await pool.query<{ selection: Record<string, null> }>(
            `select selection from tournament_classic_period_loadout
              where period_number = 1`,
          );
          expect(periodLoadout.rows[0]?.selection).toEqual({
            stick: null,
            skates: null,
            nutrition: null,
          });
        }
        const shot = await app.inject({
          method: 'POST',
          url: `/tournaments/${TOURNAMENT_ID}/classic/shot`,
          headers: { authorization },
          payload: { shot_index: 1, input: { tapTime: 0 }, claimed_result: 'miss' },
        });
        expect(shot.statusCode).toBe(200);
        expect(reconcile).toHaveBeenCalledTimes(period === 3 ? 1 : 0);
        vi.setSystemTime(new Date(NOW.getTime() + period));
      }
    } finally {
      vi.useRealTimers();
      await app.close();
    }
  });

  it('rejects beginner Classic period start and shot before creating gameplay state', async () => {
    await pool.query(`update users set level = 1, lifetime_goals_total = 17 where id = $1`, [
      PLAYER_ID,
    ]);
    await pool.query(
      `insert into game_settings (key, value, label, description)
       values ('amateur.unlock_goals_required', '300'::jsonb, 'Порог любителей', 'preview test')
       on conflict (key) do update set value = excluded.value`,
    );
    const { databaseUrl, redisUrl } = getTestUrls();
    const app = await buildApp({
      config: {
        NODE_ENV: 'test',
        HOST: '0.0.0.0',
        PORT: 3000,
        LOG_LEVEL: 'warn',
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        JWT_SECRET,
        REFRESH_SECRET,
        TELEGRAM_BOT_TOKEN: 'classic-game-beginner-preview-bot',
        DAILY_SEED_SECRET: SEED_SECRET,
      },
      pushSchedulerEnabled: false,
      pushWorkerEnabled: false,
      tournamentLifecycleEnabled: false,
    });
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const authorization = `Bearer ${await jwt.issueAccessToken({ sub: PLAYER_ID })}`;
    const expectedError = {
      error: {
        code: 'amateur_level_required',
        message: 'amateur league is locked',
        details: { goalsRemaining: 283, unlockGoalsRequired: 300 },
      },
    };
    try {
      const start = await app.inject({
        method: 'POST',
        url: `/tournaments/${TOURNAMENT_ID}/classic/period/start`,
        headers: { authorization },
      });
      expect(start.statusCode).toBe(403);
      expect(start.json()).toEqual(expectedError);
      await expect(
        pool.query(
          `select session.id
             from tournament_classic_session session
             join tournament_participant participant on participant.id = session.participant_id
            where participant.user_id = $1`,
          [PLAYER_ID],
        ),
      ).resolves.toMatchObject({ rowCount: 0 });

      await pool.query(`update users set level = 2 where id = $1`, [PLAYER_ID]);
      await startClassicGamePeriod(pool, {
        userId: PLAYER_ID,
        tournamentId: TOURNAMENT_ID,
        now: NOW,
        seedSecret: SEED_SECRET,
      });
      await pool.query(`update users set level = 1 where id = $1`, [PLAYER_ID]);

      const shot = await app.inject({
        method: 'POST',
        url: `/tournaments/${TOURNAMENT_ID}/classic/shot`,
        headers: { authorization },
        payload: { shot_index: 1, input: { tapTime: 0 }, claimed_result: 'miss' },
      });
      expect(shot.statusCode).toBe(403);
      expect(shot.json()).toEqual(expectedError);
      const shots = await pool.query<{ count: number }>(
        `select count(*)::int as count from shot_session
          where user_id = $1 and mode = 'tournament_classic'`,
        [PLAYER_ID],
      );
      expect(shots.rows[0]?.count).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('allows period setup but rejects the first Classic shot during recent gameplay', async () => {
    await seedRecentTrainingShot(pool, new Date(NOW.getTime() - 5 * 60_000));

    const state = await getClassicGameState(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
    });
    expect(state.training_cooldown_ends_at).toBe('2030-09-01T10:55:00.000Z');
    expect(state.gameplay_lock).toEqual({
      blocked: true,
      reason: 'recent_gameplay',
      ends_at: '2030-09-01T10:55:00.000Z',
      tournament_starts_at: null,
    });

    const started = await startClassicGamePeriod(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
    });
    expect(started.state).toBe('period_active');

    expect(started.gameplay_lock).toEqual(state.gameplay_lock);
    await expect(submitMiss(pool, 1, NOW)).rejects.toMatchObject({ statusCode: 409 });
    const accepted = await pool.query<{ shots: number }>(
      `select count(*)::int as shots
         from shot_session
        where mode = 'tournament_classic'`,
    );
    expect(accepted.rows[0]!.shots).toBe(0);
  });

  it('serializes a daily shot against the first Classic shot', async () => {
    await startClassicGamePeriod(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
    });
    const dailyClient = await pool.connect();
    try {
      await dailyClient.query('begin');
      await lockUserGameplay(dailyClient, PLAYER_ID);
      const dayPool = await dailyClient.query<{ id: string }>(
        `insert into day_pool
           (user_id, day_date, state, current_period, period_started_at,
            game_core_version, daily_seed)
         values ($1, '2030-09-01', 'period_active', 1, $2, 1, 'daily-seed')
         returning id`,
        [PLAYER_ID, NOW],
      );
      await dailyClient.query(
        `insert into shot_session
           (user_id, mode, day_pool_id, period_number, shot_index, seed,
            input_payload, server_result, game_core_version, created_at)
         values ($1, 'daily', $2, 1, 1, 'daily-shot-seed', '{}'::jsonb, 'miss', 1, $3)`,
        [PLAYER_ID, dayPool.rows[0]!.id, NOW],
      );

      const classicShot = submitMiss(pool, 1, NOW);
      await waitForAdvisoryWaiter(pool);
      await dailyClient.query('commit');

      await expect(classicShot).rejects.toMatchObject({ statusCode: 409 });
    } catch (error) {
      await dailyClient.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      dailyClient.release();
    }

    const shots = await pool.query<{ mode: string; shots: number }>(
      `select mode, count(*)::int as shots
         from shot_session
        where user_id = $1 and mode in ('daily', 'tournament_classic')
        group by mode order by mode`,
      [PLAYER_ID],
    );
    expect(shots.rows).toEqual([{ mode: 'daily', shots: 1 }]);
  });

  it('rejects the first Classic shot when its advisory wait crosses T-60', async () => {
    await startClassicGamePeriod(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
    });
    await seedScheduledFixture(pool, new Date('2030-09-01T11:00:01.000Z'));
    const gate = await pool.connect();
    try {
      await gate.query('begin');
      await lockUserGameplay(gate, PLAYER_ID);
      const pending = submitMiss(pool, 1, NOW);
      const outcome = pending.then(
        () => null,
        (error: unknown) => error,
      );
      await waitForAdvisoryWaiter(pool);
      vi.setSystemTime(new Date('2030-09-01T10:00:01.000Z'));
      await gate.query('commit');
      expect(await outcome).toMatchObject({ statusCode: 409 });
      expect(
        (await pool.query("select id from shot_session where mode = 'tournament_classic'"))
          .rowCount,
      ).toBe(0);
    } finally {
      await gate.query('rollback');
      gate.release();
    }
  });

  it('timestamps an accepted Classic shot and its mismatch event after the advisory wait', async () => {
    const started = await startClassicGamePeriod(pool, {
      userId: PLAYER_ID,
      tournamentId: TOURNAMENT_ID,
      now: NOW,
      seedSecret: SEED_SECRET,
    });
    const gate = await pool.connect();
    try {
      await gate.query('begin');
      await lockUserGameplay(gate, PLAYER_ID);
      const pending = submitClassicGameShot(pool, {
        userId: PLAYER_ID,
        tournamentId: TOURNAMENT_ID,
        now: NOW,
        seedSecret: SEED_SECRET,
        shotIndex: 1,
        input: { tapTime: 0 },
        claimedResult: 'goal',
      });
      await waitForAdvisoryWaiter(pool);
      vi.setSystemTime(new Date('2030-09-01T10:00:02.000Z'));
      await gate.query('commit');
      const shot = await pending;
      expect(shot.state.server_now).toBe('2030-09-01T10:00:02.000Z');
      const stored = await pool.query<{ created_at: Date }>(
        'select created_at from shot_session where tournament_classic_session_id = $1',
        [started.session_id],
      );
      expect(stored.rows[0]!.created_at.toISOString()).toBe('2030-09-01T10:00:02.000Z');
      expect(shot.server_result).not.toBe('goal');
      const event = await pool.query<{ created_at: Date }>(
        "select created_at from event_log where user_id = $1 and type = 'shot_mismatch'",
        [PLAYER_ID],
      );
      expect(event.rows[0]!.created_at.toISOString()).toBe('2030-09-01T10:00:02.000Z');
    } finally {
      await gate.query('rollback');
      gate.release();
    }
  });

  it('rejects a real daily handler shot when the first Classic shot wins the lock race', async () => {
    const { databaseUrl, redisUrl } = getTestUrls();
    const app = await buildApp({
      config: {
        NODE_ENV: 'test',
        HOST: '0.0.0.0',
        PORT: 3000,
        LOG_LEVEL: 'warn',
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        JWT_SECRET,
        REFRESH_SECRET,
        TELEGRAM_BOT_TOKEN: 'classic-game-race-bot-token',
        DAILY_SEED_SECRET: SEED_SECRET,
      },
      pushSchedulerEnabled: false,
      pushWorkerEnabled: false,
      tournamentLifecycleEnabled: false,
    });
    await app.ready();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const jwt = createJwt({ accessSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });
    const authorization = `Bearer ${await jwt.issueAccessToken({ sub: PLAYER_ID })}`;
    const gate = await pool.connect();
    try {
      const dailyStarted = await app.inject({
        method: 'POST',
        url: '/duel/daily/period/start',
        headers: { authorization },
      });
      expect(dailyStarted.statusCode).toBe(200);
      await startClassicGamePeriod(pool, {
        userId: PLAYER_ID,
        tournamentId: TOURNAMENT_ID,
        now: NOW,
        seedSecret: SEED_SECRET,
      });

      await gate.query('begin');
      await lockUserGameplay(gate, PLAYER_ID);
      const classicShot = submitMiss(pool, 1, NOW);
      await waitForAdvisoryWaiter(pool);
      const dailyShot = app.inject({
        method: 'POST',
        url: '/duel/daily/shot',
        headers: { authorization },
        payload: { shot_index: 1, input: { tapTime: 0 }, claimed_result: 'miss' },
      });
      await waitForAdvisoryWaiter(pool, 2);
      await gate.query('commit');

      await expect(classicShot).resolves.toBeUndefined();
      await expect(dailyShot).resolves.toMatchObject({ statusCode: 409 });
      await seedScheduledFixture(pool, new Date(NOW.getTime() + 30 * 60_000));
      const refreshed = await app.inject({
        method: 'GET',
        url: '/duel/daily/state',
        headers: { authorization },
      });
      expect(refreshed.json()).toMatchObject({
        state: 'period_active',
        gameplay_lock: { blocked: true, reason: 'active_classic' },
      });
    } catch (error) {
      await gate.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      gate.release();
      vi.useRealTimers();
      await app.close();
    }

    const shots = await pool.query<{ mode: string; shots: number }>(
      `select mode, count(*)::int as shots
         from shot_session
        where user_id = $1 and mode in ('daily', 'tournament_classic')
        group by mode order by mode`,
      [PLAYER_ID],
    );
    expect(shots.rows).toEqual([{ mode: 'tournament_classic', shots: 1 }]);
  });

  it('finalizes a missed game once at the tournament-day deadline', async () => {
    const afterDeadline = new Date('2030-09-01T21:00:00.000Z');
    const first = await finalizeDueClassicTournamentDays(pool, {
      now: afterDeadline,
      seedSecret: SEED_SECRET,
    });
    const second = await finalizeDueClassicTournamentDays(pool, {
      now: afterDeadline,
      seedSecret: SEED_SECRET,
    });

    expect(first).toEqual({ finalizedDays: 1, finalizedParticipants: 1 });
    expect(second).toEqual({ finalizedDays: 0, finalizedParticipants: 0 });
    const result = await pool.query<{ goals: number; shots: number; completed: boolean }>(
      `select goals, shots, completed from tournament_daily_result
        where tournament_id = $1 and participant_id = $2 and tournament_day = 1`,
      [TOURNAMENT_ID, PARTICIPANT_ID],
    );
    expect(result.rows).toEqual([{ goals: 0, shots: 0, completed: false }]);
    const session = await pool.query<{ state: string }>(
      `select state from tournament_classic_session where tournament_id = $1`,
      [TOURNAMENT_ID],
    );
    expect(session.rows).toEqual([{ state: 'expired' }]);
  });

  it.each([
    { policy: 'all_shots' as const, expectedShots: 1, expectedCounted: true },
    { policy: 'completed_periods' as const, expectedShots: 2, expectedCounted: true },
    { policy: 'completed_game' as const, expectedShots: 0, expectedCounted: false },
  ])(
    'applies the $policy rule when the tournament day ends',
    async ({ policy, expectedShots, expectedCounted }) => {
      await configureIncompleteGamePolicy(pool, policy);
      await startClassicGamePeriod(pool, {
        userId: PLAYER_ID,
        tournamentId: TOURNAMENT_ID,
        now: NOW,
        seedSecret: SEED_SECRET,
      });
      await submitMiss(pool, 1, NOW);

      if (policy === 'completed_periods') {
        await submitMiss(pool, 2, new Date(NOW.getTime() + 1));
        const secondPeriodAt = new Date(NOW.getTime() + 2);
        await startClassicGamePeriod(pool, {
          userId: PLAYER_ID,
          tournamentId: TOURNAMENT_ID,
          now: secondPeriodAt,
          seedSecret: SEED_SECRET,
        });
        await submitMiss(pool, 1, secondPeriodAt);
      }

      await finalizeDueClassicTournamentDays(pool, {
        now: new Date('2030-09-01T21:00:00.000Z'),
        seedSecret: SEED_SECRET,
      });

      const result = await pool.query<{ shots: number; completed: boolean }>(
        `select shots, completed from tournament_daily_result
          where tournament_id = $1 and participant_id = $2 and tournament_day = 1`,
        [TOURNAMENT_ID, PARTICIPANT_ID],
      );
      expect(result.rows).toEqual([{ shots: expectedShots, completed: expectedCounted }]);
    },
  );
});
