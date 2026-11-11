import { readFile } from 'node:fs/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestPool, hasIntegrationEnv } from '../helpers/testDb.js';

describe.skipIf(!hasIntegrationEnv)('competition podium migration', () => {
  const pool = hasIntegrationEnv ? createTestPool() : null;
  afterAll(async () => { await pool?.end(); });

  it('upgrades legacy values idempotently while preserving custom, unrelated and absent settings', async () => {
    const client = await pool!.connect();
    try {
      await client.query('begin');
      await client.query('create temporary table game_settings (key text primary key, value jsonb, updated_at timestamptz) on commit drop');
      await client.query(`insert into game_settings values
        ('amateur.monthly_rating.overall.first.coins', '15000', now()),
        ('amateur.monthly_rating.overall.first.stars', '300', now()),
        ('amateur.monthly_rating.overall.second.coins', '10000', now()),
        ('amateur.monthly_rating.overall.second.stars', '200', now()),
        ('amateur.monthly_rating.overall.third.coins', '7500', now()),
        ('custom.unrelated', '15000', now())`);
      const migration = await readFile(new URL('../../db/migrations/264_competition_podium_rewards.sql', import.meta.url), 'utf8');
      expect((await client.query(migration)).rowCount).toBe(5);
      const read = async () => new Map((await client.query<{ key: string; value: number }>('select key, value from game_settings')).rows.map(row => [row.key, row.value]));
      expect(await read()).toEqual(new Map([
        ['amateur.monthly_rating.overall.first.coins', 110000],
        ['amateur.monthly_rating.overall.first.stars', 600],
        ['amateur.monthly_rating.overall.second.coins', 50000],
        ['amateur.monthly_rating.overall.second.stars', 300],
        ['amateur.monthly_rating.overall.third.coins', 25000],
        ['custom.unrelated', 15000],
      ]));
      expect((await client.query(migration)).rowCount).toBe(0);
      await client.query("update game_settings set value='120000' where key='amateur.monthly_rating.overall.first.coins'");
      await client.query("delete from game_settings where key='amateur.monthly_rating.overall.second.coins'");
      expect((await client.query(migration)).rowCount).toBe(0);
      const values = await read();
      expect(values.get('amateur.monthly_rating.overall.first.coins')).toBe(120000);
      expect(values.has('amateur.monthly_rating.overall.second.coins')).toBe(false);
    } finally {
      await client.query('rollback');
      client.release();
    }
  });
});
