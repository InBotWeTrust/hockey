import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveShotSeed,
  GAME_CORE_VERSION,
  GOAL_OPENING,
  getSessionPhaseOffsets,
  PUCK_START,
  resolvePerspectiveCourtShot,
  STICK_NEUTRAL,
  type ShotInput,
} from '@hockey/game-core';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import {
  acknowledgeBonusPreview,
  startBonusPeriod,
  startOrResumeBonusAttempt,
  submitBonusShot,
  type SubmitBonusShotInput,
} from '../../src/bonusGames/service.js';
import {
  buildBonusGoalieConfig,
  type BonusPeriodRule,
} from '../../src/bonusGames/types.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const NOW = new Date('2026-08-23T12:00:00.000Z');
const SHOT_AT = new Date('2026-08-23T12:00:01.000Z');
const SEED_SECRET = 'bonus-shot-test-secret';
const ATTEMPT_SEED = 'fixed-bonus-attempt-seed';
const RECORDED_ATTEMPT_SEED = '478567b225fa179b20d47bc27ee0658aa321572f4eada383a91c4e101f66d4d8';
const RECORDED_SHOT_AT = new Date('2026-08-23T12:01:45.816Z');

const PERIODS: BonusPeriodRule[] = [
  {
    periodNumber: 1,
    durationMs: 300_000,
    shotsLimit: 3,
    goalFrequency: 0.45,
    goalieFrequency: 0.5,
    shooterFrequency: 0.65,
    puckSpeedPerMs: 1.2,
    goaliePattern: 'linear',
    goalieAmplitude: 1,
    goalAmplitude: 220,
  },
];

// Hand-checked against the fixed attempt seed and perspective period snapshot: 854 ms is
// a goal. The hostile optional overrides intentionally produce a non-goal if
// the server trusts them instead of rebuilding the authoritative input.
const GOAL_INPUT: ShotInput = {
  tapTime: 854,
  shooterTapTime: 854,
  puckSpeedPerMs: 0.2,
  shooterFrequency: 3,
  goalieFrequency: 3,
  goalFrequency: 3,
};

const SECOND_SHOT_INPUT: ShotInput = {
  ...GOAL_INPUT,
  tapTime: 2_023,
  shooterTapTime: 1_589.666_666_666_666_5,
};

const THIRD_SHOT_INPUT: ShotInput = {
  ...GOAL_INPUT,
  tapTime: 3_000,
  shooterTapTime: 2_133.333_333_333_333,
};

const FOURTH_SHOT_INPUT: ShotInput = {
  ...GOAL_INPUT,
  tapTime: 4_000,
  shooterTapTime: 2_700,
};

const RECORDED_CLIENT_SAVE_INPUT: ShotInput = {
  tapTime: 105_815.999_999_880_79,
  shooterTapTime: 105_815.999_999_880_79,
  puckSpeedPerMs: 1.2,
  shooterFrequency: 0.65,
  goalieFrequency: 0.5,
  goalFrequency: 0.45,
};

const SECOND_SHOT_AT = new Date('2026-08-23T12:00:03.000Z');
const THIRD_SHOT_AT = new Date('2026-08-23T12:00:05.000Z');
const FOURTH_SHOT_AT = new Date('2026-08-23T12:00:07.000Z');

function withoutShooterTime(): SubmitBonusShotInput['input'] {
  const { shooterTapTime: _omitted, ...input } = GOAL_INPUT;
  return input as SubmitBonusShotInput['input'];
}

interface TestGame {
  id: string;
  arenaId: string;
}

interface BalanceRow {
  coins: number;
  stars: number;
  experience: number;
}

interface MutationSnapshot extends BalanceRow {
  status: string;
  state: string;
  shotsTaken: number;
  goals: number;
  updatedAt: Date;
  shots: number;
  periodLogs: number;
  completions: number;
  arenaUnlocks: number;
  ledgerEvents: number;
  economyEvents: number;
  auditEvents: number;
  currencyAccounts: number;
}

describe.skipIf(!hasIntegrationEnv)('bonus game deterministic shots and rewards', () => {
  let pool: Pool;
  let defaultArenaId: string;
  let userSequence = 0;
  let gameSequence = 0;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('truncate users, arena_theme restart identity cascade');
    userSequence = 0;
    gameSequence = 0;
    const arena = await pool.query<{ id: string }>(
      `insert into arena_theme
         (slug, title, artwork_url, thumbnail_url, status, is_selectable)
       values ('default', 'Стандартная', '/arenas/default.webp',
               '/arenas/default-thumb.webp', 'active', true)
       returning id`,
    );
    defaultArenaId = arena.rows[0]!.id;
  });

  async function createUser(): Promise<string> {
    userSequence += 1;
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: `bonus-shot-${userSequence}`,
      displayName: `Bonus Shooter ${userSequence}`,
      timezone: 'Europe/Moscow',
    });
    await pool.query(
      `update users
          set level = 2, xp = 5, experience = 10
        where id = $1`,
      [user.id],
    );
    await pool.query(
      `insert into user_currency_account (user_id, balance)
       values ($1, 20)`,
      [user.id],
    );
    return user.id;
  }

  async function createGame({
    targetGoals,
    periods = PERIODS,
    requiredGoalStreak = 0,
  }: {
    targetGoals: number;
    periods?: BonusPeriodRule[];
    requiredGoalStreak?: number;
  }): Promise<TestGame> {
    gameSequence += 1;
    const slug = `shot-game-${gameSequence}`;
    const game = await pool.query<{ id: string }>(
      `insert into bonus_game
         (slug, title, skill_code, description, sort_order, status, access_type, unlock_price_stars,
          target_goals, qualification_rules, total_periods, break_duration_ms, period_rules,
          reward_coins, reward_stars, reward_experience, arena_theme_id,
          goalkeeper_ready_url, goalkeeper_save_url, revision)
       values ($1, $2, 'accuracy', '', $3, 'active', 'free', 0,
               $4, $5::jsonb, $6, 30000, $7::jsonb,
               100, 1, 50, $8, $9, $10, 3)
       returning id`,
      [
        slug,
        `Игра ${gameSequence}`,
        gameSequence,
        targetGoals,
        JSON.stringify({
          type: 'goals_from_shots',
          targetGoals,
          shotsLimit: periods.reduce((sum, period) => sum + (period.shotsLimit ?? 0), 0),
          ...(requiredGoalStreak > 0 ? { requiredGoalStreak } : {}),
        }),
        periods.length,
        JSON.stringify(periods),
        defaultArenaId,
        `/goalies/${slug}-ready.webp`,
        `/goalies/${slug}-save.webp`,
      ],
    );
    return { id: game.rows[0]!.id, arenaId: defaultArenaId };
  }

  async function createActiveAttempt(
    userId: string,
    gameId: string,
    startedAt = NOW,
    attemptSeed = ATTEMPT_SEED,
  ): Promise<string> {
    const created = await startOrResumeBonusAttempt(pool, {
      userId,
      gameId,
      now: startedAt,
      seedSecret: SEED_SECRET,
    });
    await pool.query(
      `update bonus_game_attempt
          set attempt_seed = $2
        where id = $1`,
      [created.attempt.id, attemptSeed],
    );
    await acknowledgeBonusPreview(pool, {
      userId,
      attemptId: created.attempt.id,
      dismissFuture: false,
      now: startedAt,
    });
    await startBonusPeriod(pool, { userId, attemptId: created.attempt.id, now: startedAt });
    return created.attempt.id;
  }

  async function balances(userId: string): Promise<BalanceRow> {
    const { rows } = await pool.query<BalanceRow>(
      `select account.balance::int as coins,
              users.xp::int as stars,
              users.experience::int as experience
         from users
         join user_currency_account account on account.user_id = users.id
        where users.id = $1`,
      [userId],
    );
    return rows[0]!;
  }

  async function countRows(table: string, where: string, values: unknown[]): Promise<number> {
    const { rows } = await pool.query<{ count: number }>(
      `select count(*)::int as count from ${table} where ${where}`,
      values,
    );
    return rows[0]!.count;
  }

  async function mutationSnapshot(userId: string, attemptId: string): Promise<MutationSnapshot> {
    const { rows } = await pool.query<{
      status: string;
      state: string;
      shots_taken: number;
      goals: number;
      updated_at: Date;
      coins: number;
      stars: number;
      experience: number;
      shots: number;
      period_logs: number;
      completions: number;
      arena_unlocks: number;
      ledger_events: number;
      economy_events: number;
      audit_events: number;
      currency_accounts: number;
    }>(
      `select attempt.status,
              attempt.state,
              attempt.shots_taken::int,
              attempt.goals::int,
              attempt.updated_at,
              coalesce(account.balance, 0)::int as coins,
              users.xp::int as stars,
              users.experience::int,
              (select count(*)::int from shot_session where bonus_game_attempt_id = attempt.id) as shots,
              (select count(*)::int from bonus_game_period_log where attempt_id = attempt.id) as period_logs,
              (select count(*)::int from user_bonus_game_completion where attempt_id = attempt.id) as completions,
              (select count(*)::int from user_arena_unlock where user_id = users.id) as arena_unlocks,
              (select count(*)::int from currency_ledger where user_id = users.id) as ledger_events,
              (select count(*)::int from bonus_game_economy_event where attempt_id = attempt.id) as economy_events,
              (select count(*)::int from event_log where user_id = users.id) as audit_events,
              (select count(*)::int from user_currency_account where user_id = users.id) as currency_accounts
         from bonus_game_attempt attempt
         join users on users.id = attempt.user_id
         left join user_currency_account account on account.user_id = users.id
        where attempt.id = $1 and users.id = $2`,
      [attemptId, userId],
    );
    const snapshot = rows[0]!;
    return {
      status: snapshot.status,
      state: snapshot.state,
      shotsTaken: Number(snapshot.shots_taken),
      goals: Number(snapshot.goals),
      updatedAt: snapshot.updated_at,
      coins: Number(snapshot.coins),
      stars: Number(snapshot.stars),
      experience: Number(snapshot.experience),
      shots: Number(snapshot.shots),
      periodLogs: Number(snapshot.period_logs),
      completions: Number(snapshot.completions),
      arenaUnlocks: Number(snapshot.arena_unlocks),
      ledgerEvents: Number(snapshot.ledger_events),
      economyEvents: Number(snapshot.economy_events),
      auditEvents: Number(snapshot.audit_events),
      currencyAccounts: Number(snapshot.currency_accounts),
    };
  }

  it('accepts the snapshot-derived result and ignores inventory and client speed overrides', async () => {
    const userId = await createUser();
    const game = await createGame({ targetGoals: 2 });
    const attemptId = await createActiveAttempt(userId, game.id);
    await pool.query('delete from user_sticks where user_id = $1', [userId]);
    await pool.query('delete from user_equipment where user_id = $1', [userId]);

    const response = await submitBonusShot(pool, {
      userId,
      attemptId,
      claimedShotIndex: 1,
      input: GOAL_INPUT,
      claimedResult: 'goal',
      now: SHOT_AT,
    });

    expect(response).toMatchObject({
      serverResult: 'goal',
      rewardGranted: null,
      attempt: { status: 'active', state: 'period_active', shotsTaken: 1, goals: 1 },
    });
    const shot = await pool.query<{
      seed: string;
      input_payload: ShotInput;
      server_result: string;
      game_core_version: number;
    }>(
      `select seed, input_payload, server_result, game_core_version
         from shot_session
        where bonus_game_attempt_id = $1`,
      [attemptId],
    );
    expect(shot.rows[0]).toEqual({
      seed: deriveShotSeed(ATTEMPT_SEED, 1, 1),
      input_payload: {
        tapTime: 854,
        shooterTapTime: 854,
        puckSpeedPerMs: 1.2,
        shooterFrequency: 0.65,
        goalieFrequency: 0.5,
        goalFrequency: 0.45,
      },
      server_result: 'goal',
      game_core_version: GAME_CORE_VERSION,
    });
  });

  it('accepts the recorded PlayView save using the same perspective session offsets', async () => {
    const userId = await createUser();
    const game = await createGame({ targetGoals: 1 });
    const attemptId = await createActiveAttempt(userId, game.id, NOW, RECORDED_ATTEMPT_SEED);

    const response = await submitBonusShot(pool, {
      userId,
      attemptId,
      claimedShotIndex: 1,
      input: RECORDED_CLIENT_SAVE_INPUT as SubmitBonusShotInput['input'],
      claimedResult: 'save',
      now: RECORDED_SHOT_AT,
    });

    expect(response).toMatchObject({
      serverResult: 'save',
      rewardGranted: null,
      attempt: { status: 'active', state: 'period_active', shotsTaken: 1, goals: 0 },
    });
    expect(
      resolvePerspectiveCourtShot(
        RECORDED_CLIENT_SAVE_INPUT,
        {
          id: 'bonus:shot-game-1:p1',
          name: 'Игра 1',
          pattern: 'linear',
          hp: 0,
          baseReward: 0,
          firstClearBonus: 0,
          speed: 0,
          amplitude: 1,
          frequency: 0.5,
          goalAmplitude: 220,
          goalFrequency: 0.45,
        },
        deriveShotSeed(RECORDED_ATTEMPT_SEED, 1, 1),
        1,
        STICK_NEUTRAL,
        getSessionPhaseOffsets(RECORDED_ATTEMPT_SEED),
      ).type,
    ).toBe('save');
  });

  it('rejects any shot index other than the authoritative period count plus one', async () => {
    const userId = await createUser();
    const game = await createGame({ targetGoals: 2 });
    const attemptId = await createActiveAttempt(userId, game.id);

    await expect(
      submitBonusShot(pool, {
        userId,
        attemptId,
        claimedShotIndex: 2,
        input: GOAL_INPUT,
        claimedResult: 'goal',
        now: SHOT_AT,
      }),
    ).rejects.toMatchObject({ code: 'bonus_shot_index_mismatch', statusCode: 409 });
    expect(await countRows('shot_session', 'bonus_game_attempt_id = $1', [attemptId])).toBe(0);
  });

  it.each([
    {
      name: 'negative tap time',
      shotInput: { ...GOAL_INPUT, tapTime: -1 },
      now: SHOT_AT,
      code: 'bonus_shot_time_invalid',
      statusCode: 400,
    },
    {
      name: 'non-finite shooter time',
      shotInput: { ...GOAL_INPUT, shooterTapTime: Number.POSITIVE_INFINITY },
      now: SHOT_AT,
      code: 'bonus_shot_time_invalid',
      statusCode: 400,
    },
    {
      name: 'stale tap time',
      shotInput: { ...GOAL_INPUT, tapTime: 0, shooterTapTime: 0 },
      now: new Date('2026-08-23T12:00:20.000Z'),
      code: 'bonus_shot_time_stale',
      statusCode: 409,
    },
    {
      name: 'future tap time',
      shotInput: { ...GOAL_INPUT, tapTime: 4_000, shooterTapTime: 4_000 },
      now: SHOT_AT,
      code: 'bonus_shot_time_stale',
      statusCode: 409,
    },
    {
      name: 'independently forged shooter time',
      shotInput: { ...GOAL_INPUT, shooterTapTime: 0 },
      now: SHOT_AT,
      code: 'bonus_shot_time_invalid',
      statusCode: 400,
    },
  ])('rejects $name before any shot, aggregate, or reward mutation', async (testCase) => {
    const userId = await createUser();
    const game = await createGame({ targetGoals: 1 });
    const attemptId = await createActiveAttempt(userId, game.id);
    const before = await mutationSnapshot(userId, attemptId);

    await expect(
      submitBonusShot(pool, {
        userId,
        attemptId,
        claimedShotIndex: 1,
        input: testCase.shotInput,
        claimedResult: 'goal',
        now: testCase.now,
      }),
    ).rejects.toMatchObject({ code: testCase.code, statusCode: testCase.statusCode });

    expect(await mutationSnapshot(userId, attemptId)).toEqual(before);
  });

  it('requires shooter time at the service boundary before any mutation', async () => {
    const userId = await createUser();
    const game = await createGame({ targetGoals: 1 });
    const attemptId = await createActiveAttempt(userId, game.id);
    const before = await mutationSnapshot(userId, attemptId);

    await expect(
      submitBonusShot(pool, {
        userId,
        attemptId,
        claimedShotIndex: 1,
        input: withoutShooterTime(),
        claimedResult: 'goal',
        now: SHOT_AT,
      }),
    ).rejects.toMatchObject({ code: 'bonus_shot_time_invalid', statusCode: 400 });

    expect(await mutationSnapshot(userId, attemptId)).toEqual(before);
  });

  it('rejects missing clocks before an expired attempt can reconcile or write a period log', async () => {
    const userId = await createUser();
    const game = await createGame({ targetGoals: 1 });
    const attemptId = await createActiveAttempt(userId, game.id);
    const before = await mutationSnapshot(userId, attemptId);

    await expect(
      submitBonusShot(pool, {
        userId,
        attemptId,
        claimedShotIndex: 1,
        input: withoutShooterTime(),
        claimedResult: 'goal',
        now: new Date('2026-08-23T12:05:01.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'bonus_shot_time_invalid', statusCode: 400 });

    expect(await mutationSnapshot(userId, attemptId)).toEqual(before);
  });

  it.each([
    { name: 'missing shooter time', shotInput: withoutShooterTime() },
    {
      name: 'non-finite tap time',
      shotInput: { ...GOAL_INPUT, tapTime: Number.POSITIVE_INFINITY },
    },
  ])('rejects $name on a completed duplicate before any mutation', async ({ shotInput }) => {
    const userId = await createUser();
    const game = await createGame({ targetGoals: 1 });
    const attemptId = await createActiveAttempt(userId, game.id);
    await submitBonusShot(pool, {
      userId,
      attemptId,
      claimedShotIndex: 1,
      input: GOAL_INPUT,
      claimedResult: 'goal',
      now: SHOT_AT,
    });
    const before = await mutationSnapshot(userId, attemptId);

    await expect(
      submitBonusShot(pool, {
        userId,
        attemptId,
        claimedShotIndex: 1,
        input: shotInput,
        claimedResult: 'goal',
        now: new Date('2026-08-23T12:00:10.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'bonus_shot_time_invalid', statusCode: 400 });

    expect(await mutationSnapshot(userId, attemptId)).toEqual(before);
  });

  it('keeps a valid completed-shot duplicate idempotently successful', async () => {
    const userId = await createUser();
    const game = await createGame({ targetGoals: 1 });
    const attemptId = await createActiveAttempt(userId, game.id);
    await submitBonusShot(pool, {
      userId,
      attemptId,
      claimedShotIndex: 1,
      input: GOAL_INPUT,
      claimedResult: 'goal',
      now: SHOT_AT,
    });
    const before = await mutationSnapshot(userId, attemptId);

    const duplicate = await submitBonusShot(pool, {
      userId,
      attemptId,
      claimedShotIndex: 1,
      input: GOAL_INPUT,
      claimedResult: 'goal',
      now: new Date('2026-08-23T12:00:10.000Z'),
    });

    expect(duplicate).toMatchObject({
      serverResult: 'goal',
      rewardGranted: null,
      attempt: { status: 'completed', state: 'closed', shotsTaken: 1, goals: 1 },
    });
    expect(await mutationSnapshot(userId, attemptId)).toEqual(before);
  });

  it('rejects jointly forged first-shot clocks far behind the authoritative period timeline', async () => {
    const userId = await createUser();
    const game = await createGame({ targetGoals: 1 });
    const attemptId = await createActiveAttempt(userId, game.id);
    const before = await mutationSnapshot(userId, attemptId);

    await expect(
      submitBonusShot(pool, {
        userId,
        attemptId,
        claimedShotIndex: 1,
        input: { ...GOAL_INPUT, tapTime: 730, shooterTapTime: 730 },
        claimedResult: 'goal',
        now: new Date('2026-08-23T12:00:30.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'bonus_shot_time_stale', statusCode: 409 });

    expect(await mutationSnapshot(userId, attemptId)).toEqual(before);
  });

  it('rejects a forged shooter phase after an accepted shot', async () => {
    const userId = await createUser();
    const game = await createGame({ targetGoals: 3 });
    const attemptId = await createActiveAttempt(userId, game.id);
    await submitBonusShot(pool, {
      userId,
      attemptId,
      claimedShotIndex: 1,
      input: GOAL_INPUT,
      claimedResult: 'goal',
      now: SHOT_AT,
    });
    const before = await mutationSnapshot(userId, attemptId);

    await expect(
      submitBonusShot(pool, {
        userId,
        attemptId,
        claimedShotIndex: 2,
        input: { ...GOAL_INPUT, tapTime: 1_000, shooterTapTime: 800 },
        claimedResult: 'goal',
        now: new Date('2026-08-23T12:00:02.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'bonus_shot_time_invalid', statusCode: 400 });

    expect(await mutationSnapshot(userId, attemptId)).toEqual(before);
  });

  it('accepts the continuous scene and shooter clocks after one completed flight pause', async () => {
    const userId = await createUser();
    const game = await createGame({ targetGoals: 3 });
    const attemptId = await createActiveAttempt(userId, game.id);
    await submitBonusShot(pool, {
      userId,
      attemptId,
      claimedShotIndex: 1,
      input: GOAL_INPUT,
      claimedResult: 'goal',
      now: SHOT_AT,
    });

    const response = await submitBonusShot(pool, {
      userId,
      attemptId,
      claimedShotIndex: 2,
      input: SECOND_SHOT_INPUT,
      claimedResult: 'miss',
      now: new Date('2026-08-23T12:00:03.000Z'),
    });

    expect(response).toMatchObject({
      serverResult: 'miss',
      attempt: { status: 'active', state: 'period_active', shotsTaken: 2, goals: 1 },
    });
  });

  it('accepts the fourth shot after three daily-style result pauses', async () => {
    const userId = await createUser();
    const period = { ...PERIODS[0]!, shotsLimit: 10 };
    const game = await createGame({ targetGoals: 10, periods: [period] });
    const attemptId = await createActiveAttempt(userId, game.id);
    await submitBonusShot(pool, {
      userId,
      attemptId,
      claimedShotIndex: 1,
      input: GOAL_INPUT,
      claimedResult: 'goal',
      now: SHOT_AT,
    });
    await submitBonusShot(pool, {
      userId,
      attemptId,
      claimedShotIndex: 2,
      input: SECOND_SHOT_INPUT,
      claimedResult: 'miss',
      now: SECOND_SHOT_AT,
    });
    await submitBonusShot(pool, {
      userId,
      attemptId,
      claimedShotIndex: 3,
      input: THIRD_SHOT_INPUT,
      claimedResult: 'miss',
      now: THIRD_SHOT_AT,
    });
    const fourthResult = resolvePerspectiveCourtShot(
      FOURTH_SHOT_INPUT,
      buildBonusGoalieConfig('shot-game-1', 'Игра 1', period),
      deriveShotSeed(ATTEMPT_SEED, 1, 4),
      4,
      STICK_NEUTRAL,
      getSessionPhaseOffsets(ATTEMPT_SEED),
    ).type;

    const response = await submitBonusShot(pool, {
      userId,
      attemptId,
      claimedShotIndex: 4,
      input: FOURTH_SHOT_INPUT,
      claimedResult: fourthResult,
      now: FOURTH_SHOT_AT,
    });

    expect(response.attempt).toMatchObject({
      status: 'active',
      state: 'period_active',
      shotsTaken: 4,
    });
  });

  it('accepts thirty shots when real browser result pauses run slightly longer than one second', async () => {
    const userId = await createUser();
    const period = { ...PERIODS[0]!, shotsLimit: 40 };
    const game = await createGame({ targetGoals: 40, periods: [period] });
    const attemptId = await createActiveAttempt(userId, game.id);
    const flightMs = (PUCK_START.y - GOAL_OPENING.y) / period.puckSpeedPerMs;

    for (let shotIndex = 1; shotIndex <= 30; shotIndex += 1) {
      const previousShots = shotIndex - 1;
      const wallElapsedMs = shotIndex * 3_000;
      const tapTime = wallElapsedMs - previousShots * 1_150;
      const input: ShotInput = {
        tapTime,
        shooterTapTime: tapTime - previousShots * (flightMs + 10),
        puckSpeedPerMs: period.puckSpeedPerMs,
        shooterFrequency: period.shooterFrequency,
        goalieFrequency: period.goalieFrequency,
        goalFrequency: period.goalFrequency,
      };
      const claimedResult = resolvePerspectiveCourtShot(
        input,
        buildBonusGoalieConfig('shot-game-1', 'Игра 1', period),
        deriveShotSeed(ATTEMPT_SEED, 1, shotIndex),
        shotIndex,
        STICK_NEUTRAL,
        getSessionPhaseOffsets(ATTEMPT_SEED),
      ).type;

      await submitBonusShot(pool, {
        userId,
        attemptId,
        claimedShotIndex: shotIndex,
        input,
        claimedResult,
        now: new Date(NOW.getTime() + wallElapsedMs),
      });
    }

    const attempt = await pool.query<{ shots_taken: number }>(
      'select shots_taken::int from bonus_game_attempt where id = $1',
      [attemptId],
    );
    expect(attempt.rows[0]?.shots_taken).toBe(30);
  });

  it('keeps accepting an admin-sized period when browser rendering delays accumulate like daily play', async () => {
    // A location image decode, background tab, or slow phone may stretch the visual result pause.
    // Daily play tolerates that drift; bonus rules edited to longer periods must not become
    // unplayable only because the client clock falls behind the wall clock over many shots.
    const userId = await createUser();
    const period = { ...PERIODS[0]!, durationMs: 300_000, shotsLimit: 50 };
    const game = await createGame({ targetGoals: 50, periods: [period] });
    const attemptId = await createActiveAttempt(userId, game.id);
    const flightMs = (PUCK_START.y - GOAL_OPENING.y) / period.puckSpeedPerMs;

    for (let shotIndex = 1; shotIndex <= 30; shotIndex += 1) {
      const previousShots = shotIndex - 1;
      const wallElapsedMs = shotIndex * 3_000;
      const tapTime = wallElapsedMs - previousShots * 1_600;
      const input: ShotInput = {
        tapTime,
        shooterTapTime: tapTime - previousShots * flightMs,
        puckSpeedPerMs: period.puckSpeedPerMs,
        shooterFrequency: period.shooterFrequency,
        goalieFrequency: period.goalieFrequency,
        goalFrequency: period.goalFrequency,
      };
      const claimedResult = resolvePerspectiveCourtShot(
        input,
        buildBonusGoalieConfig('shot-game-1', 'Игра 1', period),
        deriveShotSeed(ATTEMPT_SEED, 1, shotIndex),
        shotIndex,
        STICK_NEUTRAL,
        getSessionPhaseOffsets(ATTEMPT_SEED),
      ).type;

      await submitBonusShot(pool, {
        userId,
        attemptId,
        claimedShotIndex: shotIndex,
        input,
        claimedResult,
        now: new Date(NOW.getTime() + wallElapsedMs),
      });
    }

    const attempt = await pool.query<{ shots_taken: number }>(
      'select shots_taken::int from bonus_game_attempt where id = $1',
      [attemptId],
    );
    expect(attempt.rows[0]?.shots_taken).toBe(30);
  });

  it('accepts resumed clocks derived from authoritative elapsed time and accepted pauses', async () => {
    const userId = await createUser();
    const game = await createGame({ targetGoals: 3 });
    const attemptId = await createActiveAttempt(userId, game.id);
    await submitBonusShot(pool, {
      userId,
      attemptId,
      claimedShotIndex: 1,
      input: GOAL_INPUT,
      claimedResult: 'goal',
      now: SHOT_AT,
    });
    const resumed = await startOrResumeBonusAttempt(pool, {
      userId,
      gameId: game.id,
      now: new Date('2026-08-23T12:00:10.000Z'),
      seedSecret: SEED_SECRET,
    });
    expect(resumed).toMatchObject({ created: false, attempt: { id: attemptId, shotsTaken: 1 } });

    const response = await submitBonusShot(pool, {
      userId,
      attemptId,
      claimedShotIndex: 2,
      input: { ...GOAL_INPUT, tapTime: 9_000, shooterTapTime: 8_566.666_666_666_666 },
      claimedResult: 'miss',
      now: new Date('2026-08-23T12:00:10.000Z'),
    });

    expect(response).toMatchObject({
      serverResult: 'miss',
      attempt: { status: 'active', state: 'period_active', shotsTaken: 2, goals: 1 },
    });
  });

  it('closes a nonfinal period at quota in the accepted-shot transaction and keeps duplicate retry idempotent', async () => {
    const userId = await createUser();
    const secondPeriod: BonusPeriodRule = { ...PERIODS[0]!, periodNumber: 2 };
    const game = await createGame({ targetGoals: 5, periods: [PERIODS[0]!, secondPeriod] });
    const attemptId = await createActiveAttempt(userId, game.id);
    await submitBonusShot(pool, {
      userId,
      attemptId,
      claimedShotIndex: 1,
      input: GOAL_INPUT,
      claimedResult: 'goal',
      now: SHOT_AT,
    });
    await submitBonusShot(pool, {
      userId,
      attemptId,
      claimedShotIndex: 2,
      input: SECOND_SHOT_INPUT,
      claimedResult: 'miss',
      now: SECOND_SHOT_AT,
    });

    const finalInput = {
      userId,
      attemptId,
      claimedShotIndex: 3,
      input: THIRD_SHOT_INPUT,
      claimedResult: 'miss' as const,
      now: THIRD_SHOT_AT,
    };
    const response = await submitBonusShot(pool, finalInput);

    expect(response).toMatchObject({
      serverResult: 'miss',
      rewardGranted: null,
      attempt: {
        status: 'active',
        state: 'break_active',
        currentPeriod: 1,
        periodStartedAt: null,
        breakStartedAt: THIRD_SHOT_AT.toISOString(),
        closedAt: null,
        shotsTaken: 3,
        currentPeriodShotsTaken: 3,
        goals: 1,
      },
    });
    const period = await pool.query<{
      shots_taken: number;
      goals: number;
      closed_reason: string;
      ended_at: Date;
    }>(
      `select shots_taken, goals, closed_reason, ended_at
         from bonus_game_period_log
        where attempt_id = $1`,
      [attemptId],
    );
    expect(period.rows).toEqual([
      { shots_taken: 3, goals: 1, closed_reason: 'quota', ended_at: THIRD_SHOT_AT },
    ]);
    const beforeDuplicate = await mutationSnapshot(userId, attemptId);

    const duplicate = await submitBonusShot(pool, finalInput);

    expect(duplicate).toMatchObject({
      serverResult: 'miss',
      rewardGranted: null,
      attempt: { status: 'active', state: 'break_active', currentPeriodShotsTaken: 3 },
    });
    expect(await mutationSnapshot(userId, attemptId)).toEqual(beforeDuplicate);
  });

  it('keeps the current and best goal streak when the next period starts', async () => {
    const userId = await createUser();
    const periods: BonusPeriodRule[] = [
      { ...PERIODS[0]!, shotsLimit: 1 },
      { ...PERIODS[0]!, periodNumber: 2, shotsLimit: 1 },
    ];
    const game = await createGame({ targetGoals: 2, periods, requiredGoalStreak: 2 });
    const attemptId = await createActiveAttempt(userId, game.id);

    const firstPeriod = await submitBonusShot(pool, {
      userId,
      attemptId,
      claimedShotIndex: 1,
      input: GOAL_INPUT,
      claimedResult: 'goal',
      now: SHOT_AT,
    });
    expect(firstPeriod.attempt).toMatchObject({
      state: 'break_active',
      currentGoalStreak: 1,
      bestGoalStreak: 1,
    });

    const secondPeriod = await startBonusPeriod(pool, {
      userId,
      attemptId,
      now: new Date('2026-08-23T12:00:32.000Z'),
    });
    expect(secondPeriod).toMatchObject({
      state: 'period_active',
      currentPeriod: 2,
      currentGoalStreak: 1,
      bestGoalStreak: 1,
    });
  });

  it('fails the attempt at final-period quota in the accepted-shot transaction and keeps duplicate retry idempotent', async () => {
    const userId = await createUser();
    const game = await createGame({ targetGoals: 2 });
    const attemptId = await createActiveAttempt(userId, game.id);
    await submitBonusShot(pool, {
      userId,
      attemptId,
      claimedShotIndex: 1,
      input: GOAL_INPUT,
      claimedResult: 'goal',
      now: SHOT_AT,
    });
    await submitBonusShot(pool, {
      userId,
      attemptId,
      claimedShotIndex: 2,
      input: SECOND_SHOT_INPUT,
      claimedResult: 'miss',
      now: SECOND_SHOT_AT,
    });
    const finalInput = {
      userId,
      attemptId,
      claimedShotIndex: 3,
      input: THIRD_SHOT_INPUT,
      claimedResult: 'miss' as const,
      now: THIRD_SHOT_AT,
    };

    const response = await submitBonusShot(pool, finalInput);

    expect(response).toMatchObject({
      serverResult: 'miss',
      rewardGranted: null,
      attempt: {
        status: 'failed',
        state: 'closed',
        currentPeriod: 1,
        periodStartedAt: null,
        breakStartedAt: null,
        closedAt: THIRD_SHOT_AT.toISOString(),
        shotsTaken: 3,
        currentPeriodShotsTaken: 3,
        goals: 1,
      },
    });
    const beforeDuplicate = await mutationSnapshot(userId, attemptId);

    const duplicate = await submitBonusShot(pool, finalInput);

    expect(duplicate).toMatchObject({
      serverResult: 'miss',
      rewardGranted: null,
      attempt: { status: 'failed', state: 'closed', currentPeriodShotsTaken: 3 },
    });
    expect(await mutationSnapshot(userId, attemptId)).toEqual(beforeDuplicate);
    expect(beforeDuplicate.periodLogs).toBe(1);
    expect(beforeDuplicate.economyEvents).toBe(0);
  });

  it('completes instead of failing when the target is reached on the quota-edge shot', async () => {
    const userId = await createUser();
    const game = await createGame({ targetGoals: 3 });
    const attemptId = await createActiveAttempt(userId, game.id);
    await submitBonusShot(pool, {
      userId,
      attemptId,
      claimedShotIndex: 1,
      input: GOAL_INPUT,
      claimedResult: 'goal',
      now: SHOT_AT,
    });
    await submitBonusShot(pool, {
      userId,
      attemptId,
      claimedShotIndex: 2,
      input: {
        ...SECOND_SHOT_INPUT,
        tapTime: 1_940,
        shooterTapTime: 1_506.666_666_666_666_5,
      },
      claimedResult: 'goal',
      now: new Date('2026-08-23T12:00:02.854Z'),
    });
    const quotaEdgeInput = {
      userId,
      attemptId,
      claimedShotIndex: 3,
      input: {
        ...THIRD_SHOT_INPUT,
        tapTime: 2_212,
        shooterTapTime: 1_345.333_333_333_333_5,
      },
      claimedResult: 'goal' as const,
      now: new Date('2026-08-23T12:00:04.117Z'),
    };

    const response = await submitBonusShot(pool, quotaEdgeInput);

    expect(response).toMatchObject({
      serverResult: 'goal',
      rewardGranted: { coins: 100, stars: 1, experience: 50 },
      attempt: {
        status: 'completed',
        state: 'closed',
        shotsTaken: 3,
        currentPeriodShotsTaken: 3,
        goals: 3,
      },
    });
    const period = await pool.query<{ closed_reason: string }>(
      'select closed_reason from bonus_game_period_log where attempt_id = $1',
      [attemptId],
    );
    expect(period.rows).toEqual([{ closed_reason: 'target_reached' }]);
    const beforeDuplicate = await mutationSnapshot(userId, attemptId);

    const duplicate = await submitBonusShot(pool, quotaEdgeInput);

    expect(duplicate).toMatchObject({
      serverResult: 'goal',
      rewardGranted: null,
      attempt: { status: 'completed', state: 'closed', rewardGranted: true },
    });
    expect(await mutationSnapshot(userId, attemptId)).toEqual(beforeDuplicate);
    expect(beforeDuplicate.periodLogs).toBe(1);
    expect(beforeDuplicate.economyEvents).toBe(1);
  });

  it('rejects an unsupported game-core version before mutating shot or reward state', async () => {
    const userId = await createUser();
    const game = await createGame({ targetGoals: 1 });
    const attemptId = await createActiveAttempt(userId, game.id);
    await pool.query(
      `update bonus_game_attempt
          set game_core_version = $2
        where id = $1`,
      [attemptId, GAME_CORE_VERSION + 1],
    );
    await pool.query('delete from user_currency_account where user_id = $1', [userId]);
    const before = await mutationSnapshot(userId, attemptId);

    const [submission] = await Promise.allSettled([
      submitBonusShot(pool, {
        userId,
        attemptId,
        claimedShotIndex: 1,
        input: GOAL_INPUT,
        claimedResult: 'goal',
        now: SHOT_AT,
      }),
    ]);

    expect(await mutationSnapshot(userId, attemptId)).toEqual(before);
    expect(submission).toMatchObject({
      status: 'rejected',
      reason: { code: 'bonus_game_core_version_mismatch', statusCode: 409 },
    });
  });

  it('persists mismatch audit while rejecting the unaccepted shot', async () => {
    const userId = await createUser();
    const game = await createGame({ targetGoals: 2 });
    const attemptId = await createActiveAttempt(userId, game.id);

    await expect(
      submitBonusShot(pool, {
        userId,
        attemptId,
        claimedShotIndex: 1,
        input: GOAL_INPUT,
        claimedResult: 'save',
        now: SHOT_AT,
      }),
    ).rejects.toMatchObject({ code: 'bonus_shot_result_mismatch', statusCode: 409 });

    expect(await countRows('shot_session', 'bonus_game_attempt_id = $1', [attemptId])).toBe(0);
    const audit = await pool.query<{ payload: Record<string, unknown>; created_at: Date }>(
      `select payload, created_at
         from event_log
        where user_id = $1 and type = 'shot_mismatch'`,
      [userId],
    );
    expect(audit.rows[0]?.payload).toEqual({
      mode: 'bonus',
      bonus_game_attempt_id: attemptId,
      period_number: 1,
      shot_index: 1,
      claimed_result: 'save',
      server_result: 'goal',
    });
    expect(audit.rows[0]?.created_at).toEqual(SHOT_AT);
  });

  it('grants first-clear currencies atomically without unlocking a home arena', async () => {
    const userId = await createUser();
    const game = await createGame({ targetGoals: 1 });
    const attemptId = await createActiveAttempt(userId, game.id);

    const response = await submitBonusShot(pool, {
      userId,
      attemptId,
      claimedShotIndex: 1,
      input: GOAL_INPUT,
      claimedResult: 'goal',
      now: SHOT_AT,
    });

    expect(response).toMatchObject({
      serverResult: 'goal',
      rewardGranted: { coins: 100, stars: 1, experience: 50 },
      attempt: {
        status: 'completed',
        state: 'closed',
        closedAt: SHOT_AT.toISOString(),
        shotsTaken: 1,
        goals: 1,
      },
    });
    expect(await balances(userId)).toEqual({ coins: 120, stars: 6, experience: 60 });
    expect(
      await countRows('user_bonus_game_completion', 'user_id = $1 and bonus_game_id = $2', [
        userId,
        game.id,
      ]),
    ).toBe(1);
    expect(
      await countRows('user_arena_unlock', 'user_id = $1 and arena_theme_id = $2', [
        userId,
        game.arenaId,
      ]),
    ).toBe(0);
    expect(
      await countRows('currency_ledger', "user_id = $1 and reason = 'bonus_game_reward'", [userId]),
    ).toBe(1);
    const period = await pool.query<{
      shots_taken: number;
      goals: number;
      closed_reason: string;
      ended_at: Date;
    }>(
      `select shots_taken, goals, closed_reason, ended_at
         from bonus_game_period_log
        where attempt_id = $1`,
      [attemptId],
    );
    expect(period.rows[0]).toEqual({
      shots_taken: 1,
      goals: 1,
      closed_reason: 'target_reached',
      ended_at: SHOT_AT,
    });
  });

  it('rolls back the final shot and partial balances if first-clear persistence fails', async () => {
    const userId = await createUser();
    const game = await createGame({ targetGoals: 1 });
    const attemptId = await createActiveAttempt(userId, game.id);
    await pool.query(
      `update bonus_game_attempt
          set reward_snapshot = '{"coins":100,"stars":-1000,"experience":50}'::jsonb
        where id = $1`,
      [attemptId],
    );

    await expect(
      submitBonusShot(pool, {
        userId,
        attemptId,
        claimedShotIndex: 1,
        input: GOAL_INPUT,
        claimedResult: 'goal',
        now: SHOT_AT,
      }),
    ).rejects.toMatchObject({ code: '23514' });

    expect(await balances(userId)).toEqual({ coins: 20, stars: 5, experience: 10 });
    expect(await countRows('shot_session', 'bonus_game_attempt_id = $1', [attemptId])).toBe(0);
    expect(await countRows('user_bonus_game_completion', 'attempt_id = $1', [attemptId])).toBe(0);
    const attempt = await pool.query<{ status: string; state: string; shots_taken: number }>(
      `select status, state, shots_taken
         from bonus_game_attempt
        where id = $1`,
      [attemptId],
    );
    expect(attempt.rows[0]).toEqual({
      status: 'active',
      state: 'period_active',
      shots_taken: 0,
    });
  });

  it('completes a replay with zero newly granted reward', async () => {
    const userId = await createUser();
    const game = await createGame({ targetGoals: 1 });
    const firstAttemptId = await createActiveAttempt(userId, game.id);
    await submitBonusShot(pool, {
      userId,
      attemptId: firstAttemptId,
      claimedShotIndex: 1,
      input: GOAL_INPUT,
      claimedResult: 'goal',
      now: SHOT_AT,
    });
    const afterFirstClear = await balances(userId);

    const replayStartedAt = new Date('2026-08-23T12:01:00.000Z');
    const replayAttemptId = await createActiveAttempt(userId, game.id, replayStartedAt);
    const replay = await submitBonusShot(pool, {
      userId,
      attemptId: replayAttemptId,
      claimedShotIndex: 1,
      input: GOAL_INPUT,
      claimedResult: 'goal',
      now: new Date('2026-08-23T12:01:01.000Z'),
    });

    expect(replay).toMatchObject({
      serverResult: 'goal',
      rewardGranted: null,
      attempt: { status: 'completed', state: 'closed' },
    });
    expect(await balances(userId)).toEqual(afterFirstClear);
    expect(
      await countRows(
        'bonus_game_economy_event',
        "user_id = $1 and bonus_game_id = $2 and kind = 'first_clear_reward'",
        [userId, game.id],
      ),
    ).toBe(1);
  });

  it('completes after a catalogue reset preserved the reward event but removed completion', async () => {
    const userId = await createUser();
    const game = await createGame({ targetGoals: 1 });
    await pool.query(
      `update users
          set xp = 6, experience = 60
        where id = $1`,
      [userId],
    );
    await pool.query(
      `update user_currency_account
          set balance = 120
        where user_id = $1`,
      [userId],
    );
    await pool.query(
      `insert into currency_ledger
         (user_id, reason, available_delta, reserved_delta,
          balance_after, reserved_after, metadata, created_at)
       values ($1, 'bonus_game_reward', 100, 0, 120, 0,
               jsonb_build_object('bonus_game_id', $2::text), $3)`,
      [userId, game.id, NOW],
    );
    await pool.query(
      `insert into bonus_game_economy_event
         (user_id, bonus_game_id, attempt_id, kind,
          coins_delta, stars_delta, experience_delta,
          coins_after, stars_after, experience_after, snapshot, created_at)
       values ($1, $2, null, 'first_clear_reward',
               100, 1, 50, 120, 6, 60,
               '{"coins":100,"stars":1,"experience":50}'::jsonb, $3)`,
      [userId, game.id, NOW],
    );
    const attemptId = await createActiveAttempt(userId, game.id);

    const response = await submitBonusShot(pool, {
      userId,
      attemptId,
      claimedShotIndex: 1,
      input: GOAL_INPUT,
      claimedResult: 'goal',
      now: SHOT_AT,
    });

    expect(response).toMatchObject({
      serverResult: 'goal',
      rewardGranted: null,
      attempt: {
        status: 'completed',
        state: 'closed',
        rewardGranted: false,
        shotsTaken: 1,
        goals: 1,
      },
    });
    expect(await balances(userId)).toEqual({ coins: 120, stars: 6, experience: 60 });
    expect(await countRows('shot_session', 'bonus_game_attempt_id = $1', [attemptId])).toBe(1);
    expect(await countRows('user_bonus_game_completion', 'attempt_id = $1', [attemptId])).toBe(1);
    expect(
      await countRows(
        'bonus_game_economy_event',
        "user_id = $1 and bonus_game_id = $2 and kind = 'first_clear_reward'",
        [userId, game.id],
      ),
    ).toBe(1);
    expect(
      await countRows('currency_ledger', "user_id = $1 and reason = 'bonus_game_reward'", [userId]),
    ).toBe(1);
  });

  it('grants the first-clear reward once when the final shot is submitted concurrently', async () => {
    const userId = await createUser();
    const game = await createGame({ targetGoals: 2 });
    const attemptId = await createActiveAttempt(userId, game.id);
    await submitBonusShot(pool, {
      userId,
      attemptId,
      claimedShotIndex: 1,
      input: GOAL_INPUT,
      claimedResult: 'goal',
      now: SHOT_AT,
    });
    const finalShotInput = {
      userId,
      attemptId,
      claimedShotIndex: 2,
      input: {
        ...GOAL_INPUT,
        tapTime: 1_940,
        shooterTapTime: 1_506.666_666_666_666_5,
      },
      claimedResult: 'goal' as const,
      now: new Date('2026-08-23T12:00:02.854Z'),
    };

    const results = await Promise.allSettled([
      submitBonusShot(pool, finalShotInput),
      submitBonusShot(pool, finalShotInput),
    ]);

    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
    const rewards = results.map((result) =>
      result.status === 'fulfilled' ? result.value.rewardGranted : undefined,
    );
    expect(rewards).toContainEqual({ coins: 100, stars: 1, experience: 50 });
    expect(rewards).toContain(null);
    expect(
      await countRows(
        'bonus_game_economy_event',
        "user_id = $1 and bonus_game_id = $2 and kind = 'first_clear_reward'",
        [userId, game.id],
      ),
    ).toBe(1);
    expect(await countRows('shot_session', 'bonus_game_attempt_id = $1', [attemptId])).toBe(2);
    expect(await balances(userId)).toEqual({ coins: 120, stars: 6, experience: 60 });
  });
});
