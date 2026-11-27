import { DUEL_FORMAT_DEFINITIONS } from '../../src/achievements/duelFormatCatalog.js';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { PUCK_START, GOAL_OPENING } from '@hockey/game-core';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { evaluateDuelSettledAchievements } from '../../src/achievements/engine.js';
import { fetchAchievementCatalogueForUser } from '../../src/achievements/service.js';
import { claimCurrentAchievementStage } from '../../src/achievements/claimStage.js';
import { DUEL_FORMAT_IDS } from '../../src/achievements/duelFormatCatalog.js';

describe.skipIf(!hasIntegrationEnv)('live duel format progress and rewards', () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, fileURLToPath(new URL('../../db/migrations', import.meta.url)));
  }, 60000);
  afterAll(async () => {
    await pool?.end();
  });
  async function user() {
    const id = randomUUID();
    await pool.query(
      "insert into users(id,display_name,timezone,amateur_onboarding_completed) values($1,'Duel feat test','UTC',true)",
      [id],
    );
    return id;
  }
  async function tx<T>(run: (c: PoolClient) => Promise<T>) {
    const c = await pool.connect();
    try {
      await c.query('begin');
      const r = await run(c);
      await c.query('commit');
      return r;
    } catch (e) {
      await c.query('rollback');
      throw e;
    } finally {
      c.release();
    }
  }
  const card = async (u: string, id: string) =>
    (await fetchAchievementCatalogueForUser(pool, u)).find((a) => a.id === id);
  type Shot = {
    result?: 'goal' | 'save' | 'miss';
    points?: number;
    technique?: string;
    startedMs?: number;
    contacts?: number;
  };
  async function match(
    a: string,
    b: string,
    options: {
      kind?: string;
      window?: number;
      winner?: string | null;
      reason?: string;
      old?: boolean;
      shots?: [Shot[], Shot[]];
    } = {},
  ) {
    const id = randomUUID(),
      kind = options.kind ?? 'express',
      winner = options.winner === undefined ? a : options.winner;
    const rules = {
      duelKind: kind,
      totalPeriods: 1,
      shotsPerPeriod: 30,
      periodRules: [{ periodNumber: 1, durationMs: 8000, shotsLimit: null }],
      periodSpeedPresets: [],
      scoredClockVersion: 2,
      rhythmVersion: 4,
      marathonWindowMs: options.window ?? 7000,
    };
    await pool.query(
      `insert into amateur_duel_match(id,challenger_user_id,opponent_user_id,status,rules_snapshot,match_seed,starts_at,ends_at,winner_user_id,outcome,settled_reason,game_core_version,settled_at,duel_kind,created_at)
      values($1,$2,$3,'settled',$4,'test-seed',now()-interval '1 hour',now()+interval '1 hour',$5,$6,$7,132,now(),$8,case when $9 then '2000-01-01Z'::timestamptz else now() end)`,
      [
        id,
        a,
        b,
        JSON.stringify(rules),
        winner,
        winner === null ? 'draw' : winner === a ? 'challenger_win' : 'opponent_win',
        options.reason ?? 'completed',
        kind,
        options.old ?? false,
      ],
    );
    const shots = options.shots ?? [[{}, {}], [{}]];
    for (const [i, u] of [a, b].entries()) {
      const own = shots[i]!;
      await pool.query(
        `insert into amateur_duel_participant(match_id,user_id,side,state,shots_taken,goals,completed_at,active_duration_ms) values($1,$2,$3,'completed',$4,$5,now(),8000)`,
        [
          id,
          u,
          i === 0 ? 'challenger' : 'opponent',
          own.length,
          own.filter((s) => (s.result ?? 'goal') === 'goal').length,
        ],
      );
      for (const [n, s] of own.entries())
        await pool.query(
          `insert into shot_session(user_id,mode,amateur_duel_match_id,period_number,shot_index,seed,input_payload,server_result,game_core_version,awarded_points)
        values($1,'amateur_duel',$2,1,$3,'test-shot',$4,$5,132,$6)`,
          [
            u,
            id,
            n + 1,
            JSON.stringify({
              tapTime: s.startedMs ?? 0,
              periodTapTime: s.startedMs ?? 0,
              puckSpeedPerMs: (PUCK_START.y - GOAL_OPENING.y) / 100,
              rhythmTravel: 0,
              rhythmBoardContacts: s.contacts ?? 0,
              sniperTechnique: s.technique ?? 'ordinary',
            }),
            s.result ?? 'goal',
            s.points ?? 10,
          ],
        );
    }
    return { matchId: id, winnerUserId: winner };
  }
  async function play(a: string, b: string, options: Parameters<typeof match>[2] = {}) {
    const e = await match(a, b, options);
    await evaluateDuelSettledAchievements(pool, e);
    return e;
  }
  it('seeds 25 cards and excludes matches created before launch', async () => {
    const a = await user(),
      b = await user();
    expect(
      (await fetchAchievementCatalogueForUser(pool, a)).filter((c) => DUEL_FORMAT_IDS.has(c.id)),
    ).toHaveLength(25);
    for (const definition of DUEL_FORMAT_DEFINITIONS) {
      const actual = await card(a, definition.id);
      expect(actual?.description).toBe(definition.description);
      expect(actual?.stage?.requirement).toBe(definition.levels[0]!.requirement);
    }
    await play(a, b, { old: true });
    expect((await card(a, 'duel-format-express-wins'))?.stage?.progressValue).toBe(0);
  });
  it('deduplicates concurrent results and claims, retaining wins while a reward waits', async () => {
    const a = await user(),
      b = await user(),
      event = await match(a, b);
    await Promise.all([
      evaluateDuelSettledAchievements(pool, event),
      evaluateDuelSettledAchievements(pool, event),
    ]);
    expect((await card(a, 'duel-format-express-wins'))?.isClaimable).toBe(true);
    const results = await Promise.allSettled([
      tx((c) => claimCurrentAchievementStage(c, a, 'duel-format-express-wins', new Date())),
      tx((c) => claimCurrentAchievementStage(c, a, 'duel-format-express-wins', new Date())),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await card(a, 'duel-format-express-wins'))?.stage).toMatchObject({
      current: 2,
      progressValue: 1,
      targetValue: 5,
    });
    for (let i = 0; i < 4; i++) await play(a, b);
    expect((await card(a, 'duel-format-express-wins'))?.isClaimable).toBe(true);
    const reward = await tx((c) =>
      claimCurrentAchievementStage(c, a, 'duel-format-express-wins', new Date()),
    );
    expect(reward.rewards).toEqual({ currency: 0, stars: 7, experience: 7, tokens: 0 });
    expect(reward.balances.starBalance).toBe(10);
  });
  it('isolates Marathon variants and carries the best streak through claims', async () => {
    const a = await user(),
      b = await user();
    for (let i = 0; i < 5; i++) await play(a, b, { kind: 'marathon', window: 4000 });
    await play(a, b, { kind: 'marathon', window: 7000, winner: b });
    expect((await card(a, 'duel-format-marathon-4-streak'))?.isClaimable).toBe(true);
    expect((await card(a, 'duel-format-marathon-7-streak'))?.isClaimable).toBe(false);
    await tx((c) =>
      claimCurrentAchievementStage(c, a, 'duel-format-marathon-4-streak', new Date()),
    );
    expect((await card(a, 'duel-format-marathon-4-streak'))?.stage).toMatchObject({
      current: 2,
      progressValue: 5,
      targetValue: 5,
    });
    expect((await card(a, 'duel-format-marathon-4-streak'))?.isClaimable).toBe(true);
  });
  it('breaks streaks on draws and technical settlements without granting technical wins', async () => {
    const a = await user(),
      b = await user();
    await play(a, b);
    await play(a, b, { winner: null });
    await play(a, b);
    expect((await card(a, 'duel-format-express-streak'))?.isClaimable).toBe(false);
    await play(a, b, { reason: 'forfeit' });
    await play(a, b);
    expect((await card(a, 'duel-format-express-streak'))?.isClaimable).toBe(false);
    await tx((c) => claimCurrentAchievementStage(c, a, 'duel-format-express-wins', new Date()));
    expect((await card(a, 'duel-format-express-wins'))?.stage?.progressValue).toBe(3);
  });
  it('credits two completed players after the lazy deadline, while excluding a forfeit', async () => {
    const a = await user(),
      b = await user();
    await play(a, b, { reason: 'window_end' });
    expect((await card(a, 'duel-format-express-wins'))?.isClaimable).toBe(true);
    const technical = await match(a, b, { reason: 'window_end' });
    await pool.query(
      "update amateur_duel_participant set state='forfeit' where match_id=$1 and user_id=$2",
      [technical.matchId, b],
    );
    await evaluateDuelSettledAchievements(pool, technical);
    await tx((c) => claimCurrentAchievementStage(c, a, 'duel-format-express-wins', new Date()));
    expect((await card(a, 'duel-format-express-wins'))?.stage?.progressValue).toBe(1);
    expect((await card(a, 'duel-format-express-streak'))?.isClaimable).toBe(false);
  });

  it('requires both Marathon variants and all other formats for Universal', async () => {
    const a = await user(),
      b = await user();
    for (const kind of ['express', 'express_plus', 'classic', 'sniper', 'rhythm'])
      await play(a, b, { kind });
    await play(a, b, { kind: 'marathon', window: 7000 });
    for (let i = 0; i < 5; i++) await play(a, b, { kind: 'express' });
    expect((await card(a, 'duel-universal'))?.isClaimable).toBe(false);
    await play(a, b, { kind: 'marathon', window: 4000 });
    expect((await card(a, 'duel-universal'))?.isClaimable).toBe(true);
    await tx((c) => claimCurrentAchievementStage(c, a, 'duel-universal', new Date()));
    expect((await card(a, 'duel-universal'))?.stage).toMatchObject({
      current: 2,
      progressValue: 1,
      targetValue: 5,
    });
  });
  it('does not accumulate Jeweler across games and reads accepted Rhythm recovery', async () => {
    const a = await user(),
      b = await user();
    for (let i = 0; i < 2; i++)
      await play(a, b, { kind: 'sniper', shots: [[{ points: 20 }], [{}]] });
    expect((await card(a, 'duel-sniper-jeweler'))?.isClaimable).toBe(false);
    await play(a, b, { kind: 'sniper', shots: [[{ points: 20 }, { points: 20 }], [{}]] });
    expect((await card(a, 'duel-sniper-jeweler'))?.isClaimable).toBe(true);
    const four = Array.from({ length: 4 }, () => ({}));
    await play(a, b, { kind: 'rhythm', shots: [[...four, { result: 'miss' }, ...four], [{}]] });
    expect((await card(a, 'duel-rhythm-wave'))?.isClaimable).toBe(true);
    expect((await card(a, 'duel-rhythm-recovery'))?.isClaimable).toBe(true);
  });
  it('does not award old one-goal margin tasks in point-scored formats', async () => {
    const a = await user(),
      b = await user();
    await play(a, b, { kind: 'sniper' });
    expect((await card(a, 'nervous-finish'))?.isClaimable).toBe(false);
    await play(a, b, { kind: 'express' });
    expect((await card(a, 'nervous-finish'))?.isClaimable).toBe(true);
  });
});
