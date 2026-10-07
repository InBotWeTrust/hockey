import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { listBonusRecords } from '../../src/bonusGames/records.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

describe.skipIf(!hasIntegrationEnv)('record migration', () => {
  let pool: Pool;
  let previousDir: string;
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations');
  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    previousDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hockey-record-migrations-'));
    for (const name of await fs.readdir(dir))
      if (name.endsWith('.sql') && name < '188_')
        await fs.symlink(path.join(dir, name), path.join(previousDir, name));
    await applyMigrations(pool, previousDir);
  });
  afterAll(async () => {
    await pool.end();
    await fs.rm(previousDir, { recursive: true, force: true });
  });
  it('imports only exact archived active time, keeps old access and awards nothing retroactively', async () => {
    const u = await findOrCreateTelegramUser(pool, {
      providerUid: 'records-legacy',
      displayName: 'Legacy',
    });
    const unknown = await findOrCreateTelegramUser(pool, {
      providerUid: 'records-unknown',
      displayName: 'Unknown',
    });
    await pool.query('update users set level=2 where id=any($1::uuid[])', [[u.id, unknown.id]]);
    const game = (
      await pool.query(
        "select * from bonus_game where skill_code='speed' and status='active' order by sort_order limit 1",
      )
    ).rows[0]!;
    const arena = (await pool.query('select * from arena_theme where id=$1', [game.arena_theme_id]))
      .rows[0]!;
    const rules = {
      gameId: game.id,
      slug: game.slug,
      title: game.title,
      skillCode: game.skill_code,
      revision: game.revision,
      targetGoals: game.target_goals,
      totalPeriods: game.total_periods,
      breakDurationMs: game.break_duration_ms,
      useInventory: game.use_inventory,
      qualificationRules: game.qualification_rules,
      periods: game.period_rules,
      goalkeeperReadyUrl: game.goalkeeper_ready_url,
      goalkeeperSaveUrl: game.goalkeeper_save_url,
      arena: {
        id: arena.id,
        slug: arena.slug,
        title: arena.title,
        artworkUrl: arena.artwork_url,
        thumbnailUrl: arena.thumbnail_url,
      },
    };
    async function insert(uid: string, archived: boolean) {
      const a = (
        await pool.query(
          `insert into bonus_game_attempt
        (user_id,bonus_game_id,attempt_seed,game_core_version,definition_revision,rules_snapshot,reward_snapshot,
         arena_theme_id_snapshot,arena_snapshot,goalkeeper_ready_url,goalkeeper_save_url,status,state,closed_at,shots_taken,goals,current_period)
        values($1,$2,'legacy',78,1,$3::jsonb,'{"coins":0,"stars":0,"experience":0}'::jsonb,$4,$5::jsonb,$6,$7,'completed','closed',now(),10,5,1) returning id`,
          [
            uid,
            game.id,
            JSON.stringify(rules),
            arena.id,
            JSON.stringify(rules.arena),
            game.goalkeeper_ready_url,
            game.goalkeeper_save_url,
          ],
        )
      ).rows[0]!;
      if (archived)
        await pool.query(
          `insert into bonus_game_period_log(attempt_id,period_number,started_at,ended_at,shots_taken,goals,total_points,duration_ms,closed_reason)
        values($1,1,'2026-10-07 10:00Z','2026-10-07 10:00:12Z',10,5,0,12000,'target_reached')`,
          [a.id],
        );
      await pool.query(
        `insert into user_bonus_game_completion(user_id,bonus_game_id,attempt_id,reward_snapshot)
        values($1,$2,$3,'{"coins":0,"stars":0,"experience":0}'::jsonb)`,
        [uid, game.id, a.id],
      );
      return a.id;
    }
    const known = await insert(u.id, true);
    await insert(unknown.id, false);
    const balances = (
      await pool.query('select id,xp,experience from users where id=any($1::uuid[]) order by id', [
        [u.id, unknown.id],
      ])
    ).rows;
    await applyMigrations(pool, dir);
    expect((await pool.query('select attempt_id,elapsed_ms from bonus_game_record')).rows).toEqual([
      { attempt_id: known, elapsed_ms: '12000' },
    ]);
    expect(
      (await pool.query('select count(*)::int n from bonus_game_record_result')).rows[0].n,
    ).toBe(0);
    expect(
      (
        await pool.query(
          'select id,xp,experience from users where id=any($1::uuid[]) order by id',
          [[u.id, unknown.id]],
        )
      ).rows,
    ).toEqual(balances);
    const rating = await listBonusRecords(pool, unknown.id, game.id, 0);
    expect(rating.currentUser).toBeNull();
    expect(rating.rows).toHaveLength(1);
    expect((await applyMigrations(pool, dir)).applied).toEqual([]);
  });
});
