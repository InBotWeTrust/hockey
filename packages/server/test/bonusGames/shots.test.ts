import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveShotSeed, GAME_CORE_VERSION, type ShotInput } from '@hockey/game-core';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import {
  startBonusPeriod,
  startOrResumeBonusAttempt,
  submitBonusShot,
} from '../../src/bonusGames/service.js';
import type { BonusPeriodRule } from '../../src/bonusGames/types.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const NOW = new Date('2026-08-23T12:00:00.000Z');
const SHOT_AT = new Date('2026-08-23T12:00:01.000Z');
const SEED_SECRET = 'bonus-shot-test-secret';
const ATTEMPT_SEED = 'fixed-bonus-attempt-seed';

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

// Hand-checked against the fixed attempt seed and period snapshot: 730 ms is
// a goal. The hostile optional overrides intentionally produce a non-goal if
// the server trusts them instead of rebuilding the authoritative input.
const GOAL_INPUT: ShotInput = {
  tapTime: 730,
  puckSpeedPerMs: 0.2,
  shooterFrequency: 3,
  goalieFrequency: 3,
  goalFrequency: 3,
};

interface TestGame {
  id: string;
  arenaId: string;
}

interface BalanceRow {
  coins: number;
  stars: number;
  experience: number;
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

  async function createGame({ targetGoals }: { targetGoals: number }): Promise<TestGame> {
    gameSequence += 1;
    const slug = `shot-game-${gameSequence}`;
    const game = await pool.query<{ id: string }>(
      `insert into bonus_game
         (slug, title, description, sort_order, status, access_type, unlock_price_stars,
          target_goals, total_periods, break_duration_ms, period_rules,
          reward_coins, reward_stars, reward_experience, arena_theme_id,
          goalkeeper_ready_url, goalkeeper_save_url, revision)
       values ($1, $2, '', $3, 'active', 'free', 0,
               $4, 1, 30000, $5::jsonb,
               100, 1, 50, $6, $7, $8, 3)
       returning id`,
      [
        slug,
        `Игра ${gameSequence}`,
        gameSequence,
        targetGoals,
        JSON.stringify(PERIODS),
        defaultArenaId,
        `/goalies/${slug}-ready.webp`,
        `/goalies/${slug}-save.webp`,
      ],
    );
    return { id: game.rows[0]!.id, arenaId: defaultArenaId };
  }

  async function createActiveAttempt(userId: string, gameId: string): Promise<string> {
    const created = await startOrResumeBonusAttempt(pool, {
      userId,
      gameId,
      now: NOW,
      seedSecret: SEED_SECRET,
    });
    await pool.query(
      `update bonus_game_attempt
          set attempt_seed = $2
        where id = $1`,
      [created.attempt.id, ATTEMPT_SEED],
    );
    await startBonusPeriod(pool, { userId, attemptId: created.attempt.id, now: NOW });
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
        tapTime: 730,
        puckSpeedPerMs: 1.2,
        shooterFrequency: 0.65,
        goalieFrequency: 0.5,
        goalFrequency: 0.45,
      },
      server_result: 'goal',
      game_core_version: GAME_CORE_VERSION,
    });
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
    const audit = await pool.query<{ payload: Record<string, unknown> }>(
      `select payload
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
  });

  it('completes immediately at the target and grants every first-clear value atomically', async () => {
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
    ).toBe(1);
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

    const replayAttemptId = await createActiveAttempt(userId, game.id);
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
      input: GOAL_INPUT,
      claimedResult: 'goal' as const,
      now: new Date('2026-08-23T12:00:02.000Z'),
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
