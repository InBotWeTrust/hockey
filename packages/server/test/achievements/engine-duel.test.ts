import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { evaluateDuelSettledAchievements } from '../../src/achievements/engine.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

describe.skipIf(!hasIntegrationEnv)('duel achievement evaluator', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('completes winner margin, clean classic, pressure, and underdog achievements', async () => {
    const winnerUserId = await createUser(pool, 50);
    const loserUserId = await createUser(pool, 200);
    const matchId = await seedSettledDuel(pool, {
      winnerUserId,
      loserUserId,
      winnerSide: 'challenger',
      goalsByPeriod: [
        [8, 7],
        [8, 7],
        [8, 7],
      ],
      completedAt: ['2026-05-31T12:01:00Z', '2026-05-31T12:00:00Z'],
      loadoutKinds: ['stick', 'skates', 'nutrition'],
    });

    await evaluateDuelSettledAchievements(pool, { matchId, winnerUserId });

    await expect(completedIds(pool, winnerUserId)).resolves.toEqual(
      expect.arrayContaining([
        'thin-edge',
        'clean-win',
        'handled-pressure',
        'underdog',
        'master-arsenal',
        'no-room-for-error',
      ]),
    );
  });

  it('tracks win streaks, host streaks, and economical wins idempotently', async () => {
    const winnerUserId = await createUser(pool, 100);
    const loserUserId = await createUser(pool, 100);

    for (let index = 0; index < 5; index += 1) {
      const matchId = await seedSettledDuel(pool, {
        winnerUserId,
        loserUserId,
        winnerSide: 'challenger',
        goalsByPeriod: [[10 + index, 9 + index]],
        completedAt: ['2026-05-31T12:01:00Z', '2026-05-31T12:02:00Z'],
        loadoutKinds: [],
      });
      await evaluateDuelSettledAchievements(pool, { matchId, winnerUserId });
      await evaluateDuelSettledAchievements(pool, { matchId, winnerUserId });
    }

    await expect(completedIds(pool, winnerUserId)).resolves.toEqual(
      expect.arrayContaining(['hunter-streak', 'dangerous-host']),
    );
    await expect(progress(pool, winnerUserId, 'economical_duel_wins')).resolves.toMatchObject({
      count: 5,
    });
  });
});

async function createUser(pool: Pool, experience: number): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into users (id, display_name, avatar_url, level, timezone, experience)
     values ($1, 'Duel Achiever', null, 1, 'UTC', $2)`,
    [id, experience],
  );
  return id;
}

async function seedSettledDuel(
  pool: Pool,
  input: {
    winnerUserId: string;
    loserUserId: string;
    winnerSide: 'challenger' | 'opponent';
    goalsByPeriod: Array<[number, number]>;
    completedAt: [string, string];
    loadoutKinds: Array<'stick' | 'skates' | 'nutrition'>;
  },
): Promise<string> {
  const challengerUserId =
    input.winnerSide === 'challenger' ? input.winnerUserId : input.loserUserId;
  const opponentUserId = input.winnerSide === 'opponent' ? input.winnerUserId : input.loserUserId;
  const rulesSnapshot = {
    templateId: randomUUID(),
    title: 'Классическая дуэль',
    description: '',
    difficulty: 'hard',
    duelKind: 'classic',
    duelVariant: 'classic',
    rankedEnabled: true,
    matchmakingEnabled: true,
    totalPeriods: input.goalsByPeriod.length,
    shotsPerPeriod: 30,
    periodDurationMs: 60_000,
    breakDurationMs: 60_000,
    periodRules: input.goalsByPeriod.map((_, index) => ({
      periodNumber: index + 1,
      mode: 'quota',
      durationMs: 60_000,
      shotsLimit: 30,
    })),
    challengeTtlMs: 900_000,
    readyDurationMs: 900_000,
    readyNoShowCooldownMs: 900_000,
    matchmakingTimeoutMs: 180_000,
    rankedDailyLimit: 100,
    rankedSameOpponentLimit: 100,
    powerCap: 100,
    goalieId: 'rookie',
    periodSpeedPresets: input.goalsByPeriod.map((_, index) => ({
      periodNumber: index + 1,
      goalFrequency: 0.55,
      goalieFrequency: 0.65,
      shooterFrequency: 0.8,
      puckSpeedPerMs: 1.3,
    })),
    stakeAmount: 0,
    entryFeeAmount: 0,
    requiredInventoryItemId: null,
    inventoryChargesPerPeriod: 0,
    winPoints: 3,
    drawPoints: 1,
    winCurrencyReward: 0,
    drawCurrencyReward: 0,
    winStarReward: 0,
  };
  const { rows } = await pool.query<{ id: string }>(
    `insert into amateur_duel_match
       (challenger_user_id, opponent_user_id, status, ranked, season_key, rules_snapshot,
        match_seed, starts_at, ends_at, winner_user_id, outcome, settled_reason,
        game_core_version, accepted_at, settled_at)
     values ($1, $2, 'settled', true, '2026-05', $3, 'seed',
             now() - interval '1 hour', now() + interval '1 hour',
             $4, $5, 'completed', 1, now() - interval '30 minutes', now())
     returning id`,
    [
      challengerUserId,
      opponentUserId,
      JSON.stringify(rulesSnapshot),
      input.winnerUserId,
      input.winnerSide === 'challenger' ? 'challenger_win' : 'opponent_win',
    ],
  );
  const matchId = rows[0]!.id;

  const loadout = {
    items: input.loadoutKinds.map((kind) => ({
      id: randomUUID(),
      kind,
      title: kind,
      rarity: 'common',
      powerScore: 1,
      duelPeriodCost: 1,
      chargesReserved: input.goalsByPeriod.length,
    })),
    powerScore: input.loadoutKinds.length,
    powerCap: 100,
  };

  await pool.query(
    `insert into amateur_duel_participant
       (match_id, user_id, side, state, loadout_snapshot, current_period, completed_at,
        shots_taken, goals, active_duration_ms, experience_snapshot)
     values
       ($1, $2, 'challenger', 'completed', $6, $7, $8, $10, $11, 60000, $12),
       ($1, $3, 'opponent', 'completed', '{}'::jsonb, $7, $9, $10, $13, 60000, $14)`,
    [
      matchId,
      challengerUserId,
      opponentUserId,
      input.winnerSide,
      input.winnerUserId,
      JSON.stringify(input.winnerSide === 'challenger' ? loadout : { items: [] }),
      input.goalsByPeriod.length,
      input.winnerSide === 'challenger' ? input.completedAt[0] : input.completedAt[1],
      input.winnerSide === 'opponent' ? input.completedAt[0] : input.completedAt[1],
      input.goalsByPeriod.length * 30,
      input.goalsByPeriod.reduce((sum, period) => sum + period[0], 0),
      input.winnerSide === 'challenger' ? 50 : 200,
      input.goalsByPeriod.reduce((sum, period) => sum + period[1], 0),
      input.winnerSide === 'opponent' ? 50 : 200,
    ],
  );

  for (let index = 0; index < input.goalsByPeriod.length; index += 1) {
    const periodNumber = index + 1;
    const [winnerGoals, loserGoals] = input.goalsByPeriod[index]!;
    await pool.query(
      `insert into amateur_duel_period_log
         (match_id, user_id, period_number, started_at, ended_at, shots_taken, goals,
          duration_ms, closed_reason)
       values
         ($1, $2, $4, now() - interval '2 minutes', now(), 30, $6, 60000, 'quota'),
         ($1, $3, $4, now() - interval '2 minutes', now(), 30, $7, 60000, 'quota')`,
      [matchId, input.winnerUserId, input.loserUserId, periodNumber, 30, winnerGoals, loserGoals],
    );
  }

  return matchId;
}

async function completedIds(pool: Pool, userId: string): Promise<string[]> {
  const { rows } = await pool.query<{ achievement_id: string }>(
    `select achievement_id
       from user_achievements
      where user_id = $1
      order by achievement_id asc`,
    [userId],
  );
  return rows.map((row) => row.achievement_id);
}

async function progress(pool: Pool, userId: string, key: string): Promise<unknown> {
  const { rows } = await pool.query<{ state: unknown }>(
    `select state from achievement_progress where user_id = $1 and key = $2`,
    [userId, key],
  );
  return rows[0]?.state ?? null;
}
