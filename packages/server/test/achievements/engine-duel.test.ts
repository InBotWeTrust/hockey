import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  evaluateDuelSettledAchievements,
  reconcileTournamentDuelAchievements,
} from '../../src/achievements/engine.js';
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

  it('keeps one-time wins, advances eligible stages, and ignores removed duel achievements', async () => {
    const winnerUserId = await createUser(pool, 50);
    const loserUserId = await createUser(pool, 200);
    const matchId = await seedSettledDuel(pool, {
      winnerUserId,
      loserUserId,
      winnerSide: 'challenger',
      goalsByPeriod: [
        [8, 7],
        [8, 7],
      ],
      completedAt: ['2026-05-31T12:01:00Z', '2026-05-31T12:00:00Z'],
      loadoutKinds: ['stick', 'skates', 'nutrition'],
    });

    await evaluateDuelSettledAchievements(pool, { matchId, winnerUserId });

    await expect(completedIds(pool, winnerUserId)).resolves.toEqual(
      expect.arrayContaining(['thin-edge', 'clean-win']),
    );
    await expect(completedIds(pool, winnerUserId)).resolves.not.toEqual(
      expect.arrayContaining(['handled-pressure', 'master-arsenal', 'no-room-for-error']),
    );
    await expect(completedStageIds(pool, winnerUserId)).resolves.toEqual(
      expect.arrayContaining(['underdog', 'no-error-classic']),
    );
  });

  it('tracks win and host stages idempotently without economical-master progress', async () => {
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

    await expect(completedStageIds(pool, winnerUserId)).resolves.toEqual(
      expect.arrayContaining(['hunter-streak', 'dangerous-host']),
    );
    await expect(progress(pool, winnerUserId, 'economical_duel_wins')).resolves.toBeNull();
  });

  it('reconciles achievements omitted from already-settled tournament duels idempotently', async () => {
    const winnerUserId = await createUser(pool, 100);
    const loserUserId = await createUser(pool, 100);
    const matchId = await seedSettledDuel(pool, {
      winnerUserId,
      loserUserId,
      winnerSide: 'challenger',
      goalsByPeriod: [[10, 9]],
      completedAt: ['2026-05-31T12:01:00Z', '2026-05-31T12:00:00Z'],
      loadoutKinds: [],
      source: 'tournament',
    });

    await expect(reconcileTournamentDuelAchievements(pool)).resolves.toEqual({
      scanned: 1,
      evaluated: 1,
    });
    const completedAfterFirstRun = await completedIds(pool, winnerUserId);
    expect(completedAfterFirstRun).toContain('nervous-finish');

    await expect(reconcileTournamentDuelAchievements(pool)).resolves.toEqual({
      scanned: 1,
      evaluated: 0,
    });
    await expect(completedIds(pool, winnerUserId)).resolves.toEqual(completedAfterFirstRun);

    const event = await pool.query(
      `select 1
         from event_log
        where user_id = $1
          and type = 'tournament_duel_achievements_reconciled'
          and payload->>'match_id' = $2`,
      [winnerUserId, matchId],
    );
    expect(event.rowCount).toBe(1);
  });

  it.each([
    ['express', 60, 'express-sniper', 'no-error-express'],
    ['express_plus', 85, 'mix-sniper', 'no-error-mix'],
  ] as const)(
    'evaluates %s format stages independently',
    async (duelKind, goals, sniperId, noErrorId) => {
      const winnerUserId = await createUser(pool, 100);
      const loserUserId = await createUser(pool, 100);
      const matchId = await seedSettledDuel(pool, {
        winnerUserId,
        loserUserId,
        winnerSide: 'challenger',
        goalsByPeriod: [[goals, goals - 1]],
        completedAt: ['2026-05-31T12:01:00Z', '2026-05-31T12:02:00Z'],
        loadoutKinds: [],
        duelKind,
        winnerNonGoals: 0,
      });

      await evaluateDuelSettledAchievements(pool, { matchId, winnerUserId });

      await expect(completedStageIds(pool, winnerUserId)).resolves.toEqual(
        expect.arrayContaining([sniperId, noErrorId]),
      );
    },
  );

  it('does not evaluate a technical settlement as a played duel', async () => {
    const winnerUserId = await createUser(pool, 100);
    const loserUserId = await createUser(pool, 100);
    const matchId = await seedSettledDuel(pool, {
      winnerUserId,
      loserUserId,
      winnerSide: 'challenger',
      goalsByPeriod: [[60, 0]],
      completedAt: ['2026-05-31T12:01:00Z', '2026-05-31T12:02:00Z'],
      loadoutKinds: [],
      duelKind: 'express',
      settledReason: 'forfeit',
    });

    await evaluateDuelSettledAchievements(pool, { matchId, winnerUserId });

    await expect(completedStageIds(pool, winnerUserId)).resolves.toEqual([]);
    await expect(completedIds(pool, winnerUserId)).resolves.toEqual([]);
  });

  it("counts a losing player's personal scoring achievement", async () => {
    const winnerUserId = await createUser(pool, 100);
    const loserUserId = await createUser(pool, 100);
    const matchId = await seedSettledDuel(pool, {
      winnerUserId,
      loserUserId,
      winnerSide: 'challenger',
      goalsByPeriod: [[60, 55]],
      completedAt: ['2026-05-31T12:01Z', '2026-05-31T12:02Z'],
      loadoutKinds: [],
      duelKind: 'express',
      winnerNonGoals: 0,
    });
    await evaluateDuelSettledAchievements(pool, { matchId, winnerUserId });
    await expect(completedStageIds(pool, loserUserId)).resolves.toContain('express-sniper');
    await expect(completedStageIds(pool, loserUserId)).resolves.not.toContain('no-error-express');
  });

  it('does not increment a win series when an earlier settled match is replayed', async () => {
    const winnerUserId = await createUser(pool, 100);
    const loserUserId = await createUser(pool, 100);
    const matches = [];
    for (let i = 0; i < 2; i++) {
      const matchId = await seedSettledDuel(pool, {
        winnerUserId,
        loserUserId,
        winnerSide: 'challenger',
        goalsByPeriod: [[10, 9]],
        completedAt: ['2026-05-31T12:01Z', '2026-05-31T12:02Z'],
        loadoutKinds: [],
      });
      matches.push(matchId);
      await evaluateDuelSettledAchievements(pool, { matchId, winnerUserId });
    }
    await evaluateDuelSettledAchievements(pool, { matchId: matches[0]!, winnerUserId });
    await expect(progress(pool, winnerUserId, 'duel_win_streak')).resolves.toMatchObject({
      count: 2,
    });
  });

  it('evaluates concurrent deliveries of one match only once', async () => {
    const winnerUserId = await createUser(pool, 100);
    const loserUserId = await createUser(pool, 100);
    const matchId = await seedSettledDuel(pool, {
      winnerUserId,
      loserUserId,
      winnerSide: 'challenger',
      goalsByPeriod: [[10, 9]],
      completedAt: ['2026-05-31T12:01Z', '2026-05-31T12:02Z'],
      loadoutKinds: [],
    });
    await Promise.all([
      evaluateDuelSettledAchievements(pool, { matchId, winnerUserId }),
      evaluateDuelSettledAchievements(pool, { matchId, winnerUserId }),
    ]);
    await expect(progress(pool, winnerUserId, 'duel_win_streak')).resolves.toMatchObject({
      count: 1,
    });
    expect(
      (
        await pool.query(
          "select count(*)::int as n from event_log where type='duel_achievements_evaluated' and payload->>'match_id'=$1",
          [matchId],
        )
      ).rows[0].n,
    ).toBe(1);
  });

  it('does not carry an existing old win counter into an already opened second stage', async () => {
    const winnerUserId = await createUser(pool, 100);
    const loserUserId = await createUser(pool, 100);
    await pool.query(
      `insert into user_achievement_stages(user_id,achievement_id,stage_number,opened_at)
      values($1,'hunter-streak',2,now()-interval '1 minute')`,
      [winnerUserId],
    );
    await pool.query(
      `insert into achievement_progress(user_id,key,state) values($1,'duel_win_streak','{"count":5,"lastMatchId":"old-match"}')`,
      [winnerUserId],
    );
    const matchId = await seedSettledDuel(pool, {
      winnerUserId,
      loserUserId,
      winnerSide: 'challenger',
      goalsByPeriod: [[10, 9]],
      completedAt: ['2026-05-31T12:01Z', '2026-05-31T12:02Z'],
      loadoutKinds: [],
    });
    await evaluateDuelSettledAchievements(pool, { matchId, winnerUserId });
    await expect(progress(pool, winnerUserId, 'duel_win_streak')).resolves.toMatchObject({
      count: 1,
    });
    await expect(completedStageIds(pool, winnerUserId)).resolves.not.toContain('hunter-streak');
  });

  it('does not grant revenge when another drawn duel happened after the loss', async () => {
    const player=await createUser(pool,100);
    const rival=await createUser(pool,100);
    const third=await createUser(pool,100);
    const fixture={winnerSide:'challenger' as const,goalsByPeriod:[[10,9]] as Array<[number,number]>,completedAt:['2026-05-31T12:01Z','2026-05-31T12:02Z'] as [string,string],loadoutKinds:[]};
    const loss=await seedSettledDuel(pool,{...fixture,winnerUserId:rival,loserUserId:player});
    await evaluateDuelSettledAchievements(pool,{matchId:loss,winnerUserId:rival});
    const draw=await seedSettledDuel(pool,{...fixture,winnerUserId:third,loserUserId:player});
    await pool.query("update amateur_duel_match set winner_user_id=null,outcome='draw' where id=$1",[draw]);
    await evaluateDuelSettledAchievements(pool,{matchId:draw,winnerUserId:null});
    const win=await seedSettledDuel(pool,{...fixture,winnerUserId:player,loserUserId:rival});
    await evaluateDuelSettledAchievements(pool,{matchId:win,winnerUserId:player});
    await expect(completedIds(pool,player)).resolves.not.toContain('revenge');
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
    source?: 'challenge' | 'tournament';
    duelKind?: 'classic' | 'express' | 'express_plus';
    settledReason?: 'completed' | 'forfeit';
    winnerNonGoals?: number;
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
    duelKind: input.duelKind ?? 'classic',
    duelVariant: input.duelKind ?? 'classic',
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
        game_core_version, accepted_at, settled_at, source, duel_kind)
     values ($1, $2, 'settled', true, '2026-05', $3, 'seed',
             now() - interval '1 hour', now() + interval '1 hour',
             $4, $5, $7, 1, now() - interval '30 minutes', now(), $6, $8)
     returning id`,
    [
      challengerUserId,
      opponentUserId,
      JSON.stringify(rulesSnapshot),
      input.winnerUserId,
      input.winnerSide === 'challenger' ? 'challenger_win' : 'opponent_win',
      input.source ?? 'challenge',
      input.settledReason ?? 'completed',
      input.duelKind ?? 'classic',
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
  const emptyLoadout = { items: [] };
  const winnerGoalsTotal = input.goalsByPeriod.reduce((sum, period) => sum + period[0], 0);
  const loserGoalsTotal = input.goalsByPeriod.reduce((sum, period) => sum + period[1], 0);
  const winnerShotsTaken = winnerGoalsTotal + (input.winnerNonGoals ?? 5);
  const loserShotsTaken = Math.max(
    input.goalsByPeriod.length * 30,
    loserGoalsTotal + (input.winnerNonGoals ?? 5),
  );
  const challengerGoalsTotal =
    input.winnerSide === 'challenger' ? winnerGoalsTotal : loserGoalsTotal;
  const opponentGoalsTotal = input.winnerSide === 'opponent' ? winnerGoalsTotal : loserGoalsTotal;
  const challengerShotsTaken =
    input.winnerSide === 'challenger' ? winnerShotsTaken : loserShotsTaken;
  const opponentShotsTaken = input.winnerSide === 'opponent' ? winnerShotsTaken : loserShotsTaken;

  await pool.query(
    `insert into amateur_duel_participant
       (match_id, user_id, side, state, loadout_snapshot, current_period, completed_at,
        shots_taken, goals, active_duration_ms, experience_snapshot)
     values
       ($1, $2, 'challenger', 'completed', $4::jsonb, $6::smallint, $7::timestamptz,
        $9::integer, $10::integer, 60000, $11::integer),
       ($1, $3, 'opponent', 'completed', $5::jsonb, $6::smallint, $8::timestamptz,
        $12::integer, $13::integer, 60000, $14::integer)`,
    [
      matchId,
      challengerUserId,
      opponentUserId,
      JSON.stringify(input.winnerSide === 'challenger' ? loadout : emptyLoadout),
      JSON.stringify(input.winnerSide === 'opponent' ? loadout : emptyLoadout),
      input.goalsByPeriod.length,
      input.winnerSide === 'challenger' ? input.completedAt[0] : input.completedAt[1],
      input.winnerSide === 'opponent' ? input.completedAt[0] : input.completedAt[1],
      challengerShotsTaken,
      challengerGoalsTotal,
      input.winnerSide === 'challenger' ? 50 : 200,
      opponentShotsTaken,
      opponentGoalsTotal,
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
         ($1, $2, $4, now() - interval '2 minutes', now(), $7, $5, 60000, 'quota'),
         ($1, $3, $4, now() - interval '2 minutes', now(), $8, $6, 60000, 'quota')`,
      [
        matchId,
        input.winnerUserId,
        input.loserUserId,
        periodNumber,
        winnerGoals,
        loserGoals,
        winnerGoals + (input.winnerNonGoals ?? 5),
        loserGoals + 5,
      ],
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

async function completedStageIds(pool: Pool, userId: string): Promise<string[]> {
  const { rows } = await pool.query<{ achievement_id: string }>(
    `select achievement_id
       from user_achievement_stages
      where user_id = $1 and completed_at is not null
      order by achievement_id`,
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
