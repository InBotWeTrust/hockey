import {
  createRhythmMovementSampler,
  projectRhythm,
  resolvePerspectiveCourtShot,
  deriveShotSeed,
  getGoalie,
  getSessionPhaseOffsets,
  STICK_NEUTRAL,
  GAME_CORE_VERSION,
  SHOOTER_AMPLITUDE,
  PUCK_START,
  GOAL_OPENING,
} from '@hockey/game-core';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app.js';
import { createJwt } from '../../../src/auth/jwt.js';
import { findOrCreateTelegramUser } from '../../../src/auth/users.js';
import { applyMigrations } from '../../../src/db/migrations.js';
import {
  getTestUrls,
  createTestPool,
  createTestRedis,
  resetDatabase,
  resetRedis,
  hasIntegrationEnv,
} from '../../helpers/testDb.js';

describe.skipIf(!hasIntegrationEnv)('Rhythm duel API', () => {
  let app: FastifyInstance;
  let players: Array<{ id: string; headers: { authorization: string } }>;
  let templates: Record<string, string>;
  const secret = 'scored-duel-test-secret-at-least-16';
  beforeAll(async () => {
    const pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, resolve('db/migrations'));
    await pool.end();
    const redis = createTestRedis();
    await resetRedis(redis);
    redis.disconnect();
    const urls = getTestUrls();
    app = await buildApp({
      config: {
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: 3000,
        LOG_LEVEL: 'warn',
        DATABASE_URL: urls.databaseUrl,
        REDIS_URL: urls.redisUrl,
        JWT_SECRET: secret,
        REFRESH_SECRET: secret,
        TELEGRAM_BOT_TOKEN: 'test-only',
        DAILY_SEED_SECRET: secret,
      },
      pushSchedulerEnabled: false,
      pushWorkerEnabled: false,
    });
    const rows = await app.pg.query(
      'select id,duel_kind from amateur_duel_template where is_active and deleted_at is null',
    );
    templates = Object.fromEntries(rows.rows.map((row) => [row.duel_kind, row.id]));
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    await app.pg.query('truncate users restart identity cascade');
    const jwt = createJwt({ accessSecret: secret, refreshSecret: secret });
    players = [];
    for (const n of [1, 2, 3]) {
      const user = await findOrCreateTelegramUser(app.pg, {
        providerUid: `scored-${n}`,
        displayName: `Scored player ${n}`,
        timezone: 'Europe/Moscow',
      });
      await app.pg.query('update users set level=2 where id=$1', [user.id]);
      players.push({
        id: user.id,
        headers: { authorization: `Bearer ${await jwt.issueAccessToken({ sub: user.id })}` },
      });
    }
  });
  const challenge = (kind: string, window = 7000) =>
    app.inject({
      method: 'POST',
      url: '/duel/amateur/challenge',
      headers: players[0]!.headers,
      payload: {
        template_id: templates[kind],
        opponent_user_id: players[1]!.id,
        ...(kind === 'marathon' ? { marathon_window_ms: window } : {}),
      },
    });

  async function start() {
    const response = await challenge('rhythm');
    expect(response.statusCode, response.body).toBe(200);
    const id = response.json().match.id;
    const post = (path: string, side = 0, payload?: object) =>
      app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${id}/${path}`,
        headers: players[side]!.headers,
        ...(payload ? { payload } : {}),
      });
    expect((await post('accept', 1)).statusCode).toBe(200);
    for (const side of [0, 1])
      expect((await post('ready', side, { loadout: {} })).statusCode).toBe(200);
    for (const side of [0, 1]) expect((await post('period/start', side)).statusCode).toBe(200);
    return { id, post, rules: response.json().match.rules };
  }
  it('freezes copied speeds, duration, scoring version and boundary; disables fights', async () => {
    const { id, rules } = await start();
    expect(rules).toMatchObject({
      duelKind: 'rhythm',
      totalPeriods: 1,
      periodDurationMs: 150000,
      rhythmVersion: 2,
      rhythmWindowTraversals: 2,
      scoredClockVersion: 2,
      shotResultPauseMs: 1000,
    });
    expect(rules.periodRules).toEqual([
      { periodNumber: 1, mode: 'time_attack', durationMs: 150000, shotsLimit: null },
    ]);
    expect(rules.marathonSpeedStages).toBeUndefined();
    const source = (
      await app.pg.query(
        "select period_speed_presets from amateur_duel_template where duel_kind='classic' and is_active and deleted_at is null limit 1",
      )
    ).rows[0];
    expect(rules.periodSpeedPresets).toEqual([source.period_speed_presets[0]]);
    const state = await app.inject({
      url: `/duel/amateur/matches/${id}`,
      headers: players[0]!.headers,
    });
    expect(state.json().match.fight?.canChallenge ?? false).toBe(false);
  });
  it('projects server travel and keeps retries idempotent, including after settlement', async () => {
    const { id, post } = await start();
    const payload = {
      shot_index: 1,
      input: { tapTime: 0, periodTapTime: 0 },
      claimed_result: 'goal',
    };
    const first = await post('shot', 0, payload);
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json().participant.rhythm_travel).toBeTypeOf('number');
    const saved = (
      await app.pg.query('select input_payload from shot_session where amateur_duel_match_id=$1', [
        id,
      ])
    ).rows[0];
    expect(saved.input_payload.rhythmTravel).toBe(0);
    const repeat = await post('shot', 0, payload);
    expect(repeat.statusCode, repeat.body).toBe(200);
    expect(repeat.json().participant.shots_taken).toBe(1);
    expect(repeat.json().server_result).toBe(first.json().server_result);
    expect((await post('period/finish')).statusCode).toBe(409);
    await app.pg.query(
      "update amateur_duel_participant set period_started_at=now()-interval '180 seconds',result_pause_starts_at=null,result_pause_ends_at=null where match_id=$1",
      [id],
    );
    const final = await post('settle');
    expect(final.statusCode, final.body).toBe(200);
    expect(final.json().match.status).toBe('settled');
    const retry = await post('shot', 0, payload);
    expect(retry.statusCode, retry.body).toBe(200);
    expect(retry.json().participant.shots_taken).toBe(1);
    const history = await app.inject({
      url: '/duel/amateur/history/calendar',
      headers: players[0]!.headers,
    });
    const row = history
      .json()
      .days.flatMap((day: any) => day.matches)
      .find((m: any) => m.id === id);
    expect(row.my_score).toBe(first.json().participant.format_score);
    expect(row.duel_kind).toBe('rhythm');
  });
  it('rejects a rewound scene clock even when the period timestamp is fresh', async () => {
    const { id, post } = await start();
    await app.pg.query(
      "update amateur_duel_participant set period_started_at=now()-interval '3 seconds' where match_id=$1",
      [id],
    );
    const response = await post('shot', 0, {
      shot_index: 1,
      input: { tapTime: 0, periodTapTime: 3000 },
      claimed_result: 'goal',
    });
    expect(response.statusCode, response.body).toBe(409);
    expect(
      (
        await app.pg.query(
          'select count(*)::int n from shot_session where amateur_duel_match_id=$1',
          [id],
        )
      ).rows[0].n,
    ).toBe(0);
  });

  it('replays real timely, missed, late and recovery shots through the authoritative route', async () => {
    const { id, post, rules } = await start();
    const timing = structuredClone(rules.noInventoryTiming);
    for (const item of [timing.skates, timing.nutrition]) {
      item.stumbleIntervalMinRolls = 0;
      item.stumbleIntervalMaxRolls = 0;
      item.fatigueGraceMs = 1000000;
    }
    rules.noInventoryTiming = timing;
    const speed = rules.periodSpeedPresets[0];
    const flight = (PUCK_START.y - GOAL_OPENING.y) / speed.puckSpeedPerMs;
    let plan: Array<{ tapTime: number; flightMs: number; travel: number; goal: boolean }> = [],
      chosenSeed = '';
    for (let candidate = 0; candidate < 50 && plan.length !== 4; candidate++) {
      const seed = `rhythm-route-${candidate}`,
        pauses: Array<{ tapTime: number; flightMs: number }> = [];
      const sample = createRhythmMovementSampler({
        seed,
        userId: players[0]!.id,
        periodNumber: 1,
        elapsedMs: 0,
        movementDistancePx: 0,
        baseLaneWidthPx: SHOOTER_AMPLITUDE * 2,
        baselineShooterSpeed: speed.shooterFrequency,
        currentShooterSpeed: speed.shooterFrequency,
        loadout: {
          stick: null,
          skates: null,
          nutrition: null,
          fallbackSkatesTiming: timing.skates,
          fallbackNutritionTiming: timing.nutrition,
        },
      });
      plan = [];
      let scene = 0,
        lastGoalTravel = 0;
      for (const [index, desired] of ['goal', 'miss', 'late', 'goal'].entries()) {
        let found = false;
        for (let t = scene; t < scene + 10000; t += 5) {
          const travel = sample.travelAt(t, pauses);
          if (desired === 'late' && travel - lastGoalTravel <= 2.1) continue;
          if (desired !== 'late' && travel - lastGoalTravel > 2) break;
          const type = resolvePerspectiveCourtShot(
            {
              tapTime: t,
              shooterMotionTime: sample.motionAt(t, pauses),
              puckSpeedPerMs: speed.puckSpeedPerMs,
              shooterFrequency: speed.shooterFrequency,
              goalieFrequency: speed.goalieFrequency,
              goalFrequency: speed.goalFrequency,
            },
            getGoalie(rules.goalieId),
            deriveShotSeed(seed, 1, index + 1),
            index + 1,
            STICK_NEUTRAL,
            getSessionPhaseOffsets(seed),
          ).type;
          if ((desired === 'miss' && type === 'goal') || (desired !== 'miss' && type !== 'goal'))
            continue;
          const goal = type === 'goal';
          plan.push({ tapTime: t, flightMs: flight, travel, goal });
          pauses.push({ tapTime: t, flightMs: flight });
          scene = t + flight + 10;
          if (goal) lastGoalTravel = travel;
          found = true;
          break;
        }
        if (!found) break;
      }
      if (plan.length === 4) chosenSeed = seed;
    }
    expect(plan).toHaveLength(4);
    await app.pg.query(
      'update amateur_duel_match set match_seed=$2,rules_snapshot=$3 where id=$1',
      [id, chosenSeed, JSON.stringify(rules)],
    );
    for (const [index, shot] of plan.entries()) {
      const periodTapTime = shot.tapTime + index * 1000;
      await app.pg.query(
        "update amateur_duel_participant set period_started_at=now()-($2::double precision*interval '1 millisecond'),result_pause_starts_at=null,result_pause_ends_at=null where match_id=$1 and user_id=$3",
        [id, periodTapTime, players[0]!.id],
      );
      const response = await post('shot', 0, {
        shot_index: index + 1,
        input: { tapTime: shot.tapTime, periodTapTime },
        claimed_result: shot.goal ? 'goal' : 'miss',
      });
      expect(response.statusCode, response.body).toBe(200);
      const actual = response.json().participant;
      const expected = projectRhythm({ shots: plan.slice(0, index + 1), travel: shot.travel });
      expect(actual.format_score).toBe(expected.score);
      expect(actual.rhythm_current_series).toBe(expected.currentSeries);
      expect(actual.rhythm_last_goal_travel).toBeCloseTo(expected.lastGoalTravel, 8);
      expect(actual.rhythm_shots[index].travel).toBeCloseTo(shot.travel, 8);
      expect(actual.goals).toBe(index === 0 ? 1 : index === 1 ? 1 : index === 2 ? 2 : 3);
    }
    expect(projectRhythm({ shots: plan, travel: plan[3]!.travel })).toMatchObject({
      score: 2,
      currentSeries: 2,
      series: [2],
    });
  });
  it('matches only a shared format and reserves the unchanged common limits', async () => {
    const join = (side: number, kinds: string[]) =>
      app.inject({
        method: 'POST',
        url: '/duel/amateur/matchmaking/join',
        headers: players[side]!.headers,
        payload: { duel_kinds: kinds },
      });
    expect((await join(0, ['rhythm'])).json().ticket).toBeDefined();
    expect((await join(1, ['classic'])).json().ticket).toBeDefined();
    const matched = await join(2, [
      'express',
      'express_plus',
      'classic',
      'sniper',
      'marathon',
      'rhythm',
    ]);
    expect(matched.statusCode, matched.body).toBe(200);
    expect(matched.json().match.rules.duelKind).toBe('rhythm');
    expect(
      (
        await app.pg.query(
          "select count(*)::int n from amateur_duel_limit_reservation where duel_kind='rhythm'",
        )
      ).rows[0].n,
    ).toBe(2);
    const templatesResponse = await app.inject({
      url: '/duel/amateur/matches',
      headers: players[0]!.headers,
    });
    const usage = templatesResponse.json().duel_limits;
    expect(usage.monthly.limit).toBe(130);
    expect(usage.monthly.format_limit).toBe(26);
    expect(usage.monthly.by_format.rhythm).toBe(1);
    const rating = await app.inject({
      url: '/duel/amateur/rating?scope=rhythm',
      headers: players[0]!.headers,
    });
    expect(rating.statusCode, rating.body).toBe(200);
  });
  it('accepts a final boundary shot, rejects a post-siren shot and denies a stranger', async () => {
    const { id, post, rules } = await start();
    for (const timing of [rules.noInventoryTiming.skates, rules.noInventoryTiming.nutrition]) {
      timing.stumbleIntervalMinRolls = 0;
      timing.stumbleIntervalMaxRolls = 0;
      timing.fatigueGraceMs = 1000000;
    }
    await app.pg.query('update amateur_duel_match set rules_snapshot=$2 where id=$1', [
      id,
      JSON.stringify(rules),
    ]);
    await app.pg.query(
      "update amateur_duel_participant set period_started_at=now()-interval '150 seconds' where match_id=$1",
      [id],
    );
    const shot = (time: number) => ({
      shot_index: 1,
      input: { tapTime: time, periodTapTime: time },
      claimed_result: 'goal',
    });
    expect((await post('shot', 2, shot(150000))).statusCode).toBe(403);
    expect((await post('shot', 0, shot(150001))).statusCode).toBe(409);
    const final = await post('shot', 0, shot(150000));
    expect(final.statusCode, final.body).toBe(200);
    expect((await post('shot', 0, shot(150000))).statusCode).toBe(200);
  });

  it('settles equal scores by all series instead of real goals and preserves both statistics', async () => {
    const { id, post, rules } = await start();
    for (const [side, travels] of [
      [0, [1, 1.5, 2, 2.5]],
      [1, [1, 1.5, 4, 4.5, 7]],
    ] as const) {
      for (const [index, travel] of travels.entries())
        await app.pg.query(
          `insert into shot_session
        (user_id,mode,amateur_duel_match_id,period_number,shot_index,seed,input_payload,server_result,game_core_version,created_at,awarded_points)
        values ($1,'amateur_duel',$2,1,$3,'saved-rhythm-fixture',$4,'goal',$5,now(),0)`,
          [
            players[side]!.id,
            id,
            index + 1,
            JSON.stringify({
              tapTime: index * 1000,
              periodTapTime: index * 2000,
              resultPauseMs: 1000,
              puckSpeedPerMs: 1.3,
              rhythmTravel: travel,
            }),
            GAME_CORE_VERSION,
          ],
        );
    }
    await app.pg.query(
      "update amateur_duel_participant set period_started_at=now()-interval '180 seconds' where match_id=$1",
      [id],
    );
    const response = await post('settle');
    expect(response.statusCode, response.body).toBe(200);
    const match = response.json().match;
    expect(match.status).toBe('settled');
    expect(match.winner_user_id).toBe(players[0]!.id);
    expect(match.me).toMatchObject({ goals: 4, format_score: 4, rhythm_series: [4] });
    expect(match.opponent).toMatchObject({ goals: 5, format_score: 4, rhythm_series: [2, 2] });
    expect(
      (
        await app.pg.query(
          'select count(*)::int n from amateur_duel_rating_match where match_id=$1',
          [id],
        )
      ).rows[0].n,
    ).toBe(2);
    const history = await app.inject({
      url: '/duel/amateur/history/calendar',
      headers: players[1]!.headers,
    });
    const row = history
      .json()
      .days.flatMap((day: any) => day.matches)
      .find((m: any) => m.id === id);
    expect(Number(row.my_score)).toBe(4);
    expect(Number(row.opponent_score)).toBe(4);
    expect(rules.rhythmVersion).toBe(2);
  });
});
