import {STICK_NEUTRAL,classifyMarksmanshipShot,getGoalie,getSessionPhaseOffsets,DEFAULT_MARKSMANSHIP_V6_SCORING_RULES} from '@hockey/game-core';
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
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

describe.skipIf(!hasIntegrationEnv)('Sniper and Marathon duel API', () => {
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
  it.each(['express', 'express_plus', 'classic', 'sniper', 'marathon', 'rhythm'])('supports existing fight offers in %s', async (kind) => {
    await app.pg.query("insert into game_settings(key,value,label,description) values('duels.fights.enabled','true'::jsonb,'Fights','Test') on conflict(key) do update set value=excluded.value");
    const invited = await challenge(kind);
    expect(invited.statusCode).toBe(200);
    const id = invited.json().match.id;
    const post = (path: string, side: number, payload?: object) => app.inject({
      method: 'POST', url: `/duel/amateur/matches/${id}/${path}`,
      headers: players[side]!.headers, ...(payload ? {payload} : {}),
    });
    expect((await post('accept', 1)).statusCode).toBe(200);
    for (const side of [0, 1]) expect((await post('ready', side, {loadout: {}})).statusCode).toBe(200);
    for (const side of [0, 1]) {
      expect((await post('period/start', side)).statusCode).toBe(200);
      await app.pg.query(`insert into amateur_duel_fight_presence(match_id,user_id,connection_id,expires_at)
        values($1,$2,'00000000-0000-4000-8000-000000000001',now()+interval '1 minute')`, [id, players[side]!.id]);
    }
    const state = await app.inject({url: `/duel/amateur/matches/${id}`, headers: players[0]!.headers});
    expect(state.json().match.fight_enabled).toBe(true);
    expect(state.json().match.fight_availability.allowed).toBe(true);
    const offer = await post('fight/challenge', 0, {requestId: '00000000-0000-4000-8000-000000000002'});
    expect(offer.statusCode).toBe(200);
    expect(offer.json().fight.status).toBe('offered');
    const replay = await post('fight/challenge', 0, {requestId: '00000000-0000-4000-8000-000000000002'});
    expect(replay.json().fight.id).toBe(offer.json().fight.id);
    const accepted = await post('fight/respond', 1, {requestId: '00000000-0000-4000-8000-000000000003', fightId: offer.json().fight.id, decision: 'accept'});
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().match.fight_paused_at).not.toBeNull();
    const paused = await app.pg.query('select period_paused_at from amateur_duel_participant where match_id=$1', [id]);
    expect(paused.rows).toHaveLength(2);
    expect(paused.rows.every(row => row.period_paused_at !== null)).toBe(true);
    const frozen = await app.inject({url: `/duel/amateur/matches/${id}`, headers: players[0]!.headers});
    const later = await app.inject({url: `/duel/amateur/matches/${id}`, headers: players[0]!.headers});
    expect(later.json().match.me.clock).toEqual(frozen.json().match.me.clock);
    if (kind === 'rhythm') expect(later.json().match.me.rhythm_travel).toBe(frozen.json().match.me.rhythm_travel);

  });
  it('keeps participant clocks at the DTO timestamp when serialization takes time', async () => {
    const invited = await challenge('marathon');
    const id = invited.json().match.id;
    const post = (path: string, side: number, payload?: object) => app.inject({
      method: 'POST', url: `/duel/amateur/matches/${id}/${path}`,
      headers: players[side]!.headers, ...(payload ? {payload} : {}),
    });
    expect((await post('accept', 1)).statusCode).toBe(200);
    for (const side of [0, 1]) expect((await post('ready', side, {loadout: {}})).statusCode).toBe(200);
    for (const side of [0, 1]) expect((await post('period/start', side)).statusCode).toBe(200);
    const realNow = Date.now.bind(Date);
    const laterClock = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 2000);
    try {
      const response = await app.inject({url: `/duel/amateur/matches/${id}`, headers: players[0]!.headers});
      expect(response.statusCode).toBe(200);
      const match = response.json().match;
      expect(match.me.clock.periodElapsedMs).toBe(Date.parse(match.server_now) - Date.parse(match.period_started_at));
      expect(match.me.clock.remainingMs).toBe(Date.parse(match.period_ends_at) - Date.parse(match.server_now));
    } finally { laterClock.mockRestore(); }
  });

  it('exposes both formats with independent first-period Classic speeds and unlimited shots', async () => {
    const response = await app.inject({
      url: '/duel/amateur/templates',
      headers: players[0]!.headers,
    });
    expect(response.statusCode).toBe(200);
    for (const kind of ['sniper', 'marathon']) {
      const row = response.json().templates.find((t: any) => t.duel_kind === kind);
      expect(row).toBeDefined();
      expect(row.period_speed_presets[0]).toMatchObject({
        goalFrequency: 0.5,
        goalieFrequency: 0.6,
        shooterFrequency: 0.75,
        puckSpeedPerMs: 0.85,
      });
      expect(row.period_rules[0]).toMatchObject({ mode: 'time_attack', shotsLimit: null, durationMs: kind === 'sniper' ? 150000 : 240000 });
    }
  });

  it('returns accepted and legacy shot categories for both players in result and history details', async () => {
    const invited = await challenge('sniper');
    const id = invited.json().match.id;
    const post = (path:string,player:number,payload?:object) => app.inject({method:'POST',url:`/duel/amateur/matches/${id}/${path}`,headers:players[player]!.headers,...(payload?{payload}:{})});
    expect((await post('accept',1)).statusCode).toBe(200);
    for(const player of [0,1]) {
      expect((await post('ready',player,{loadout:{}})).statusCode).toBe(200);
    }
    for(const player of [0,1]) expect((await post('period/start',player)).statusCode).toBe(200);
    expect((await post('shot',0,{shot_index:1,input:{tapTime:0},claimed_result:'goal'})).statusCode).toBe(200);
    const shot=(await app.pg.query('select * from shot_session where amateur_duel_match_id=$1',[id])).rows[0];
    const matchRow=(await app.pg.query('select * from amateur_duel_match where id=$1',[id])).rows[0];
    const rules=matchRow.rules_snapshot;
    let accepted:ReturnType<typeof classifyMarksmanshipShot>|null=null;
    let input=shot.input_payload;
    for(let tapTime=0;tapTime<20000;tapTime+=50){
      input={...shot.input_payload,tapTime,shooterTapTime:tapTime};
      const classification=classifyMarksmanshipShot({stickEffects:STICK_NEUTRAL,shotInput:input,goalie:getGoalie(rules.goalieId),seed:shot.seed,shotIndex:1,phaseOffsets:getSessionPhaseOffsets(matchRow.match_seed),earliestTapTime:0,scoring:rules.sniperScoring??DEFAULT_MARKSMANSHIP_V6_SCORING_RULES});
      if(classification.result.type==='goal'&&classification.v6Score){accepted=classification;break;}
    }
    expect(accepted?.v6Score).toBeTruthy();
    const technique=accepted!.v6Score!.technique,points=accepted!.awardedPoints;
    const legacyInput = { ...input };
    delete legacyInput.sniperTechnique;
    // Synthetic accepted rows in this dedicated test DB cover saved and legacy formats.
    await app.pg.query("update shot_session set input_payload=$2,server_result='goal',awarded_points=$3 where id=$1",[shot.id,JSON.stringify({...input,sniperTechnique:technique}),points]);
    await app.pg.query("insert into shot_session(user_id,mode,amateur_duel_match_id,period_number,shot_index,seed,input_payload,server_result,game_core_version,created_at,awarded_points) values($1,'amateur_duel',$2,1,1,$3,$4,'goal',$5,now(),$6)",[players[1]!.id,id,shot.seed,JSON.stringify(legacyInput),shot.game_core_version,points]);
    await app.pg.query("update amateur_duel_participant set shots_taken=1,goals=1,period_started_at=now()-interval '194 seconds' where match_id=$1",[id]);
    const result=await post('settle',0);
    expect(result.statusCode).toBe(200);
    const expected=[{category:technique,count:1,points:points/10}];
    expect(result.json().match.me.sniper_breakdown).toEqual(expected);
    expect(result.json().match.opponent.sniper_breakdown).toEqual(expected);
    const details=await app.inject({url:`/duel/amateur/matches/${id}`,headers:players[0]!.headers});
    expect(details.statusCode).toBe(200);
    expect(details.json().match.me.sniper_breakdown).toEqual(expected);
    expect(details.json().match.opponent.sniper_breakdown).toEqual(expected);
  });

  it('returns the same confirmed shot on retry without duplicating statistics', async () => {
    const invited = await challenge('sniper');
    const id = invited.json().match.id;
    const post = (path: string, player: number, payload?: object) =>
      app.inject({
        method: 'POST',
        url: `/duel/amateur/matches/${id}/${path}`,
        headers: players[player]!.headers,
        ...(payload ? { payload } : {}),
      });
    expect((await post('accept', 1)).statusCode).toBe(200);
    for (const player of [0, 1])
      expect((await post('ready', player, { loadout: {} })).statusCode).toBe(200);
    expect((await post('period/start', 0)).statusCode).toBe(200);
    const payload = { shot_index: 1, input: { tapTime: 0 }, claimed_result: 'goal' };
    const first = await post('shot', 0, payload);
    expect(first.statusCode).toBe(200);
    expect(first.json().participant.format_score).toBeTypeOf('number');
    const repeated = await post('shot', 0, payload);
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json().server_result).toBe(first.json().server_result);
    expect(repeated.json().participant.shots_taken).toBe(1);
    const count = await app.pg.query(
      'select count(*)::int as n from shot_session where amateur_duel_match_id=$1',
      [id],
    );
    expect(count.rows[0].n).toBe(1);
    expect((await post('period/start', 1)).statusCode).toBe(200);
    await app.pg.query(
      "update amateur_duel_participant set period_started_at=now()-interval '194 seconds' where match_id=$1",
      [id],
    );
    expect((await post('settle', 0)).json().match.status).toBe('settled');
    const afterFinish = await post('shot', 0, payload);
    expect(afterFinish.statusCode).toBe(200);
    expect(afterFinish.json().participant.shots_taken).toBe(1);
    expect(afterFinish.json().server_result).toBe(first.json().server_result);
    const calendar = await app.inject({
      url: '/duel/amateur/history/calendar',
      headers: players[0]!.headers,
    });
    const history = calendar
      .json()
      .days.flatMap((day: any) => day.matches)
      .find((match: any) => match.id === id);
    expect(history.my_score).toBe(first.json().participant.format_score);
    expect(history.duel_kind).toBe('sniper');
  });
  it.each(['sniper', 'marathon'])(
    'accepts a timely final %s shot and rejects a post-siren shot',
    async (kind) => {
      const invited = await challenge(kind);
      const id = invited.json().match.id;
      const rules = invited.json().match.rules;
      // This case isolates the siren boundary from seed-dependent inventory stumbles.
      for (const timing of [rules.noInventoryTiming.skates, rules.noInventoryTiming.nutrition]) {
        timing.stumbleDurationMinMs = timing.stumbleDurationMaxMs = 0;
      }
      await app.pg.query('update amateur_duel_match set rules_snapshot=$2 where id=$1', [
        id,
        JSON.stringify(rules),
      ]);
      const post = (path: string, player: number, payload?: object) =>
        app.inject({
          method: 'POST',
          url: `/duel/amateur/matches/${id}/${path}`,
          headers: players[player]!.headers,
          ...(payload ? { payload } : {}),
        });
      expect((await post('accept', 1)).statusCode).toBe(200);
      for (const player of [0, 1]) {
        expect((await post('ready', player, { loadout: {} })).statusCode).toBe(200);
      }
      for (const player of [0, 1])
        expect((await post('period/start', player)).statusCode).toBe(200);
      const duration = kind === 'sniper' ? 150000 : 240000;
      expect(invited.json().match.rules.periodRules[0].durationMs).toBe(duration);
      const boundaryNow = new Date();
      // Assert logical siren boundaries independently of SQL and CPU latency.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(boundaryNow);
      try {
        await app.pg.query(
          "update amateur_duel_participant set period_started_at=$2::timestamptz where match_id=$1",
          [id, new Date(boundaryNow.getTime() - duration)],
        );
        const shot = (tapTime: number) => ({
          shot_index: 1,
          input: { tapTime },
          claimed_result: 'goal',
        });
        expect((await post('shot', 0, shot(duration + 1))).statusCode).toBe(409);
        const finalShot = await post('shot', 0, shot(duration));
        expect(finalShot.statusCode, finalShot.body).toBe(200);
        const stored = await app.pg.query(
          'select count(*)::int n from shot_session where amateur_duel_match_id=$1',
          [id],
        );
        expect(stored.rows[0].n).toBe(1);
      } finally { vi.useRealTimers(); }
    },
  );
  it.each(['sniper','marathon'])('finishes %s immediately only at its effective deadline', async (kind) => {
    const id=(await challenge(kind)).json().match.id;
    const post=(path:string,player:number,payload?:object)=>app.inject({method:'POST',url:`/duel/amateur/matches/${id}/${path}`,headers:players[player]!.headers,...(payload?{payload}:{})});
    await post('accept',1);
    for(const player of [0,1]) expect((await post('ready',player,{loadout:{}})).statusCode).toBe(200);
    for(const player of [0,1]) expect((await post('period/start',player)).statusCode).toBe(200);
    expect((await post('period/finish',0)).statusCode).toBe(409);
    const duration=kind==='sniper'?150000:240000;
    await app.pg.query("update amateur_duel_participant set period_started_at=now()-($2::int*interval '1 millisecond'),period_paused_ms=10000 where match_id=$1 and user_id=$3",[id,duration+100,players[0]!.id]);
    expect((await post('period/finish',0)).statusCode).toBe(409);
    await app.pg.query("update amateur_duel_participant set period_started_at=now()-($2::int*interval '1 millisecond') where match_id=$1 and user_id=$3",[id,duration+10100,players[0]!.id]);
    const finished=await post('period/finish',0);
    expect(finished.statusCode).toBe(200);
    expect(finished.json().match.me).toMatchObject({state:'completed',active_duration_ms:duration});
    expect(finished.json().match.status).toBe('active');
    expect((await post('period/finish',0)).statusCode).toBe(200);
    await app.pg.query("update amateur_duel_participant set period_started_at=now()-($2::int*interval '1 millisecond') where match_id=$1 and user_id=$3",[id,duration+100,players[1]!.id]);
    expect((await post('period/finish',1)).json().match.status).toBe('settled');
    const logs=await app.pg.query('select count(*)::int as count from amateur_duel_period_log where match_id=$1',[id]);
    expect(logs.rows[0].count).toBe(2);
  });

  it('keeps the invited 4-second Marathon variant immutable on acceptance', async () => {
    const invited = await challenge('marathon', 4000);
    expect(invited.statusCode).toBe(200);
    const match = invited.json().match;
    expect(match.rules.marathonWindowMs).toBe(4000);
    const accepted = await app.inject({
      method: 'POST',
      url: `/duel/amateur/matches/${match.id}/accept`,
      headers: players[1]!.headers,
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().match.rules.marathonWindowMs).toBe(4000);
  });
  it.each([4000, 7000])(
    'replays missed %i-ms windows at zero and persists them once at completion',
    async (window) => {
      const invited = await challenge('marathon', window);
      const id = invited.json().match.id;
      const post = (path: string, player: number, payload?: object) =>
        app.inject({
          method: 'POST',
          url: `/duel/amateur/matches/${id}/${path}`,
          headers: players[player]!.headers,
          ...(payload ? { payload } : {}),
        });
      expect((await post('accept', 1)).statusCode).toBe(200);
      for (const player of [0, 1])
        expect((await post('ready', player, { loadout: {} })).statusCode).toBe(200);
      for (const player of [0, 1])
        expect((await post('period/start', player)).statusCode).toBe(200);
      await app.pg.query(
        "update amateur_duel_participant set period_started_at=now()-interval '23 seconds' where match_id=$1",
        [id],
      );
      const state = await app.inject({
        url: `/duel/amateur/matches/${id}`,
        headers: players[0]!.headers,
      });
      expect(state.json().match.me).toMatchObject({
        goals: 0,
        format_score: 0,
        marathon_penalties: Math.floor(23000 / window),
      });
      const fight = await post('fight/challenge', 0, {
        requestId: '00000000-0000-4000-8000-000000000001',
      });
      expect(fight.statusCode).toBe(409);
      await app.pg.query(
        "update amateur_duel_participant set period_started_at=now()-interval '254 seconds' where match_id=$1",
        [id],
      );
      const finished = await post('settle', 0);
      expect(finished.statusCode).toBe(200);
      expect(finished.json().match).toMatchObject({ status: 'settled', outcome: 'draw' });
      const stored = await app.pg.query(
        'select goals,format_score,marathon_penalties from amateur_duel_participant where match_id=$1',
        [id],
      );
      expect(stored.rows).toEqual(
        [0, 1].map(() => ({
          goals: 0,
          format_score: 0,
          marathon_penalties: Math.floor(240000 / window),
        })),
      );
      await post('settle', 0);
      expect(
        (
          await app.pg.query(
            'select count(*)::int n from amateur_duel_rating_match where match_id=$1',
            [id],
          )
        ).rows[0].n,
      ).toBe(2);
    },
  );
  it('never substitutes a four-format opponent ticket with the requesting player preferences', async () => {
    const join = (player: number, kinds: string[]) =>
      app.inject({
        method: 'POST',
        url: '/duel/amateur/matchmaking/join',
        headers: players[player]!.headers,
        payload: { duel_kinds: kinds },
      });
    expect(
      (await join(0, ['express', 'express_plus', 'sniper', 'marathon'])).json().ticket,
    ).toBeDefined();
    const other = await join(1, ['classic']);
    expect(other.statusCode).toBe(200);
    expect(other.json().match).toBeUndefined();
    expect(other.json().ticket).toBeDefined();
  });
  it('does not match different Marathon windows, but finds a common selected window', async () => {
    const join = (i: number, windows: number[]) =>
      app.inject({
        method: 'POST',
        url: '/duel/amateur/matchmaking/join',
        headers: players[i]!.headers,
        payload: { duel_kinds: ['marathon'], marathon_windows_ms: windows },
      });
    expect((await join(0, [4000])).json().ticket).toBeDefined();
    expect((await join(1, [7000])).json().ticket).toBeDefined();
    const joined = await join(2, [4000, 7000]);
    expect(joined.statusCode).toBe(200);
    expect(joined.json().match.rules.marathonWindowMs).toBe(4000);
    const reservations = await app.pg.query(
      "select count(*)::int as total from amateur_duel_limit_reservation where duel_kind='marathon'",
    );
    expect(reservations.rows[0].total).toBe(2);
  });
  it.each([79999, 80000, 159999, 160000])('uses the lowered Marathon base before missing-energy fatigue at %i', async (time) => {
    const invited = await challenge('marathon', 4000);
    const rules = invited.json().match.rules;
    const id = invited.json().match.id;
    expect(rules.marathonSpeedStages.map((stage: any) => stage.startsAtMs)).toEqual([80000, 160000]);
    for (const timing of [rules.noInventoryTiming.skates, rules.noInventoryTiming.nutrition]) {
      timing.stumbleDurationMinMs = timing.stumbleDurationMaxMs = 0;
      timing.fatigueGraceMs = timing.fatigueSlowdownStartMs = timing.fatigueHeavySlowdownStartMs = 0;
      timing.fatigueStopStartMs = 10000000;
      timing.fatigueHeavyMultiplier = 0.65;
    }
    await app.pg.query('update amateur_duel_match set rules_snapshot=$2 where id=$1', [id, JSON.stringify(rules)]);
    const post = (path: string, player: number, payload?: object) => app.inject({
      method: 'POST', url: `/duel/amateur/matches/${id}/${path}`, headers: players[player]!.headers,
      ...(payload ? { payload } : {}),
    });
    expect((await post('accept', 1)).statusCode).toBe(200);
    for (const player of [0, 1]) expect((await post('ready', player, { loadout: {} })).statusCode).toBe(200);
    expect((await post('period/start', 0)).statusCode).toBe(200);
    await app.pg.query("update amateur_duel_participant set period_started_at=now()-($2::int*interval '1 millisecond') where match_id=$1 and user_id=$3", [id, time, players[0]!.id]);
    const shot = { shot_index: 1, input: { tapTime: time, periodTapTime: time }, claimed_result: 'goal' };
    expect((await post('shot', 0, shot)).statusCode).toBe(200);
    const row = (await app.pg.query('select input_payload from shot_session where amateur_duel_match_id=$1', [id])).rows[0];
    const delta = rules.marathonSpeedStages.filter((stage: any) => stage.startsAtMs <= time).at(-1)?.shooterSpeedDelta ?? 0;
    expect(row.input_payload.shooterFrequency).toBeCloseTo((rules.periodSpeedPresets[0].shooterFrequency + delta) * 0.65, 4);
    expect(row.input_payload.goalFrequency).toBe(rules.periodSpeedPresets[0].goalFrequency);
    expect(row.input_payload.goalieFrequency).toBe(rules.periodSpeedPresets[0].goalieFrequency);
    expect((await post('shot', 0, shot)).statusCode).toBe(200);
  });

  it('gives an admin-created replacement Marathon template the frozen speed schedule', async () => {
    await app.pg.query("update users set role='admin' where id=$1", [players[0]!.id]);
    const existing = (await app.inject({ url: '/admin/duel-templates', headers: players[0]!.headers })).json().templates.find((t: any) => t.duelKind === 'marathon');
    const response = await app.inject({ method: 'POST', url: '/admin/duel-templates', headers: players[0]!.headers, payload: {
      ...existing, sniperScoring: undefined, title: 'Replacement Marathon', isActive: false,
      startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(),
    } });
    expect(response.statusCode).toBe(200);
    expect(response.json().template.marathonSpeedStages).toEqual(existing.marathonSpeedStages);
    const classic = (await app.pg.query("select marathon_speed_stages from amateur_duel_template where id=$1", [templates.classic])).rows[0];
    expect(classic.marathon_speed_stages).toEqual(existing.marathonSpeedStages);
  });

});
