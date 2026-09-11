import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../db/migrations',
);
const MIGRATION = '121_duel_reward_storage_limits.sql';

describe.skipIf(!hasIntegrationEnv)('121 duel reward storage limits', () => {
  let pool: Pool;
  let previousMigrationsDir: string;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    previousMigrationsDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'hockey-migrations-before-121-'),
    );
    const files = (await fs.readdir(MIGRATIONS_DIR)).filter(
      (file) => file.endsWith('.sql') && file.localeCompare(MIGRATION) < 0,
    );
    await Promise.all(
      files.map((file) =>
        fs.copyFile(path.join(MIGRATIONS_DIR, file), path.join(previousMigrationsDir, file)),
      ),
    );
    await applyMigrations(pool, previousMigrationsDir);
  });

  afterAll(async () => {
    await pool.end();
    await fs.rm(previousMigrationsDir, { recursive: true, force: true });
  });

  it('preserves historical balances, claims and oversized snapshots while enforcing new writes', async () => {
    const userId = '00000000-0000-4000-8000-000000000121';
    const otherId = '00000000-0000-4000-8000-000000000122';
    await pool.query(
      "insert into users(id,display_name,timezone,xp,stars,experience) values($1,'History','UTC',81,17,23),($2,'Other','UTC',0,0,0)",
      [userId, otherId],
    );
    await pool.query('insert into user_currency_account(user_id,balance) values($1,12345)', [
      userId,
    ]);
    await pool.query('insert into user_reward_token_account(user_id,balance) values($1,7)', [
      userId,
    ]);
    await pool.query(
      "insert into user_achievements(user_id,achievement_id,claimed_at) values($1,'first-goal',now())",
      [userId],
    );
    const challenge = await pool.query<{ id: string }>(
      "insert into weekly_challenges(title,join_open_at,start_at,end_at) values('Historical',now()-interval '15 days',now()-interval '14 days',now()-interval '7 days') returning id",
    );
    await pool.query(
      'insert into weekly_challenge_reward_claims(challenge_id,user_id,coins,stars,experience,tokens) values($1,$2,9,8,7,6)',
      [challenge.rows[0]!.id, userId],
    );
    const template = await pool.query<{ id: string }>(
      "insert into amateur_duel_template(title,is_active,starts_at,ends_at,period_speed_presets) values('Historical oversized',false,now(),now()+interval '1 day','[]') returning id",
    );
    const templateId = template.rows[0]!.id;
    await pool.query(
      "update amateur_duel_template set reward_rules=jsonb_set(reward_rules,'{equalWin,coins}','9007199254740991') where id=$1",
      [templateId],
    );
    await pool.query(
      "insert into amateur_duel_match(challenger_user_id,opponent_user_id,status,rules_snapshot,reward_rules,match_seed,starts_at,ends_at,game_core_version) select $1,$2,'settled','{\"legacy\":true}',reward_rules,'history',now()-interval '1 day',now(),1 from amateur_duel_template where id=$3",
      [userId, otherId, templateId],
    );
    const snapshot = async () => ({
      users: (await pool.query('select id,xp,stars,experience from users order by id')).rows,
      accounts: (await pool.query('select * from user_currency_account order by user_id')).rows,
      tokens: (await pool.query('select * from user_reward_token_account order by user_id')).rows,
      achievements: (
        await pool.query('select * from user_achievements order by user_id,achievement_id')
      ).rows,
      claims: (await pool.query('select * from weekly_challenge_reward_claims order by id')).rows,
      templates: (await pool.query('select * from amateur_duel_template order by id')).rows,
      matches: (await pool.query('select * from amateur_duel_match order by id')).rows,
    });
    const before = await snapshot();
    expect(await applyMigrations(pool, MIGRATIONS_DIR)).toEqual({
      applied: [
        MIGRATION,
        '122_production_data_operations.sql',
        '123_sync_inventory_catalog_from_dev.sql',
      ],
    });
    expect(await snapshot()).toEqual(before);
    expect(
      (
        await pool.query(
          "select convalidated from pg_constraint where conname in ('amateur_duel_template_reward_storage','amateur_duel_match_reward_storage') order by conname",
        )
      ).rows,
    ).toEqual([{ convalidated: false }, { convalidated: false }]);
    await expect(
      pool.query("update amateur_duel_template set title='Reject oversized write' where id=$1", [
        templateId,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    expect(await applyMigrations(pool, MIGRATIONS_DIR)).toEqual({ applied: [] });
    expect(await snapshot()).toEqual(before);
    await pool.query(
      "update amateur_duel_template set reward_rules=jsonb_set(reward_rules,'{equalWin,coins}','777') where id=$1",
      [templateId],
    );
    expect(
      (
        await pool.query(
          "select reward_rules->'equalWin'->>'coins' as coins from amateur_duel_template where id=$1",
          [templateId],
        )
      ).rows,
    ).toEqual([{ coins: '777' }]);
  });
});
