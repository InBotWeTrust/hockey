import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/app.js';
import { createJwt } from '../../../src/auth/jwt.js';
import { applyMigrations } from '../../../src/db/migrations.js';
import {
  createTestPool,
  getTestUrls,
  hasIntegrationEnv,
  resetDatabase,
} from '../../helpers/testDb.js';

const migrations = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../db/migrations',
);
const userId = '00000000-0000-4000-8000-000000000901';
const opponentId = '00000000-0000-4000-8000-000000000902';
const secret = 'historical-rewards-test-secret';

describe.skipIf(!hasIntegrationEnv)('historical duel reward API compatibility', () => {
  let previous: string;
  let app: FastifyInstance;
  let headers: { authorization: string };
  beforeAll(async () => {
    previous = await fs.mkdtemp(path.join(os.tmpdir(), 'hockey-residual-pre121-'));
    const files = (await fs.readdir(migrations)).filter(
      (name) => name.endsWith('.sql') && name < '121_',
    );
    await Promise.all(
      files.map((name) => fs.copyFile(path.join(migrations, name), path.join(previous, name))),
    );
  });
  beforeEach(async () => {
    const pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, previous);
    await pool.end();
    const { databaseUrl, redisUrl } = getTestUrls();
    app = await buildApp({
      config: {
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: 3000,
        LOG_LEVEL: 'silent',
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        JWT_SECRET: secret,
        REFRESH_SECRET: secret,
        TELEGRAM_BOT_TOKEN: 'test-token',
        DAILY_SEED_SECRET: secret,
      },
      pushSchedulerEnabled: false,
      pushWorkerEnabled: false,
    });
    await app.pg.query(
      "insert into users(id,display_name,timezone,level,role) values($1,'Historical admin','Europe/Moscow',2,'admin'),($2,'Opponent','Europe/Moscow',2,'player')",
      [userId, opponentId],
    );
    headers = {
      authorization: `Bearer ${await createJwt({ accessSecret: secret, refreshSecret: secret }).issueAccessToken({ sub: userId })}`,
    };
  });
  afterEach(async () => {
    await app.close();
  });
  afterAll(async () => {
    await fs.rm(previous, { recursive: true, force: true });
  });

  it.each(['settled-materialized', 'settled-legacy-venue', 'active'] as const)(
    'preserves and exposes oversized %s snapshots after migration 121',
    async (scenario) => {
      await app.pg.query('update amateur_duel_template set is_active=false');
      const template = await app.pg.query<{
        id: string;
      }>(`insert into amateur_duel_template(title,starts_at,ends_at,total_periods,period_speed_presets)
      values('Historical rules','2026-01-01','2100-01-01',1,'[{"periodNumber":1,"goalFrequency":0.55,"goalieFrequency":0.65,"shooterFrequency":0.8,"puckSpeedPerMs":1.3}]') returning id`);
      const templateId = template.rows[0]!.id;
      const created = await app.inject({
        method: 'POST',
        url: '/duel/amateur/challenge',
        headers,
        payload: { template_id: templateId, opponent_user_id: opponentId },
      });
      expect(created.statusCode).toBe(200);
      const matchId = created.json().match.id as string;
      const historical = {
        ...created.json().match.rules.rewardRules,
        equalWin: { coins: 2147483648, stars: 0, tokens: 0 },
      };
      await app.pg.query(
        'update amateur_duel_template set reward_rules=$2,is_active=false where id=$1',
        [templateId, historical],
      );
      await app.pg.query(
        `update amateur_duel_match set status=$2,reward_rules=$3,rules_snapshot=jsonb_set(rules_snapshot,'{rewardRules}',$3),
      starts_at='2026-08-31T19:00:00Z',ends_at='2026-08-31T20:00:00Z',season_key='2026-08',settled_at=case when $2='settled' then now() else null end,
      arena_snapshot=case when $4 then null else arena_snapshot end,
      arena_theme_id=case when $4 then null else arena_theme_id end,
      venue_policy=case when $4 then null else venue_policy end where id=$1`,
        [
          matchId,
          scenario === 'active' ? 'active' : 'settled',
          historical,
          scenario === 'settled-legacy-venue',
        ],
      );
      await app.pg.query(
        "update amateur_duel_participant set state='completed',current_period=1,shots_taken=1,goals=case when user_id=$2 then 1 else 0 end,completed_at='2026-08-31T19:59:00Z' where match_id=$1",
        [matchId, userId],
      );
      const readState = async () => ({
        matches: (await app.pg.query('select * from amateur_duel_match order by id')).rows,
        participants: (
          await app.pg.query('select * from amateur_duel_participant order by user_id')
        ).rows,
        balances: (await app.pg.query('select * from user_currency_account order by user_id')).rows,
        ledger: (await app.pg.query('select * from currency_ledger order by id')).rows,
        stars: (await app.pg.query('select id,xp from users order by id')).rows,
      });
      const before = await readState();
      expect((await applyMigrations(app.pg, migrations)).applied).toEqual([
        '121_duel_reward_storage_limits.sql',
      ]);
      const catalog = await app.inject({ method: 'GET', url: '/admin/duel-templates', headers });
      expect(catalog.statusCode).toBe(200);
      expect(
        catalog.json().templates.find((row: { id: string }) => row.id === templateId).rewardRules,
      ).toEqual(historical);
      expect(catalog.json().rewardAmountLimit).toBe(2147483647);
      for (const url of [
        '/duel/amateur/matches',
        ...(scenario === 'active' ? [] : ['/duel/amateur/history']),
      ]) {
        const response = await app.inject({ method: 'GET', url, headers });
        expect(response.statusCode).toBe(200);
        expect(
          response.json().matches.find((row: { id: string }) => row.id === matchId).rules
            .rewardRules,
        ).toEqual(historical);
      }
      const detail = await app.inject({
        method: 'GET',
        url: `/duel/amateur/matches/${matchId}`,
        headers,
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.json().match.rules.rewardRules).toEqual(historical);
      if (scenario === 'active') {
        for (let retry = 0; retry < 2; retry += 1) {
          const settled = await app.inject({
            method: 'POST',
            url: `/duel/amateur/matches/${matchId}/settle`,
            headers,
          });
          expect(settled.statusCode).toBe(409);
          expect(settled.json()).toMatchObject({
            error: { code: 'reward_configuration_capacity' },
          });
        }
      }
      expect(await readState()).toEqual(before);
      const rejected = await app.inject({
        method: 'PATCH',
        url: `/admin/duel-templates/${templateId}`,
        headers,
        payload: { rewardRules: historical },
      });
      expect(rejected.statusCode).toBe(400);
      const newUnsafe = await app.inject({
        method: 'POST',
        url: '/admin/duel-templates',
        headers,
        payload: {
          title: 'Reject new oversized configuration',
          isActive: false,
          startsAt: '2026-01-01T00:00:00Z',
          endsAt: '2100-01-01T00:00:00Z',
          totalPeriods: 1,
          periodSpeedPresets: created.json().match.rules.periodSpeedPresets,
          rewardRules: historical,
        },
      });
      expect(newUnsafe.statusCode).toBe(400);
      const corrected = await app.inject({
        method: 'PATCH',
        url: `/admin/duel-templates/${templateId}`,
        headers,
        payload: { rewardRules: { ...historical, equalWin: { coins: 777, stars: 0, tokens: 0 } } },
      });
      expect(corrected.statusCode).toBe(200);
      expect(corrected.json().template.rewardRules.equalWin.coins).toBe(777);
      expect(await readState()).toEqual(before);
    },
  );
});
