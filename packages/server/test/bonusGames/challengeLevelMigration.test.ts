import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { applyMigrations } from '../../src/db/migrations.js';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

describe.skipIf(!hasIntegrationEnv)('challenge level migration', () => {
  let pool: Pool;
  let previousDir: string;
  const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations');
  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    previousDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hockey-level-migrations-'));
    for (const name of await fs.readdir(migrationsDir)) {
      if (name.endsWith('.sql') && name < '187_') await fs.symlink(path.join(migrationsDir, name), path.join(previousDir, name));
    }
    await applyMigrations(pool, previousDir);
  });
  afterAll(async () => { await pool.end(); await fs.rm(previousDir, { recursive: true, force: true }); });
  it('credits old clears at all levels without rewriting attempts, balances or issuing rewards', async () => {
    const user = await findOrCreateTelegramUser(pool, { providerUid: 'legacy-level-test', displayName: 'Legacy Test' });
    const game = (await pool.query("select * from bonus_game where slug='challenge-beach'")).rows[0]!;
    const arena = (await pool.query('select * from arena_theme where id=$1', [game.arena_theme_id])).rows[0]!;
    const rules = { gameId: game.id, slug: game.slug, title: game.title, revision: game.revision,
      targetGoals: game.target_goals, totalPeriods: game.total_periods, breakDurationMs: game.break_duration_ms,
      periods: [], goalkeeperReadyUrl: game.goalkeeper_ready_url, goalkeeperSaveUrl: game.goalkeeper_save_url,
      arena: { id: arena.id, slug: arena.slug, title: arena.title, artworkUrl: arena.artwork_url, thumbnailUrl: arena.thumbnail_url },
      challengeEnvironment: game.challenge_environment };
    const reward = { coins: 0, stars: 10, experience: 20 };
    const attempt = (await pool.query(`insert into bonus_game_attempt
      (user_id,bonus_game_id,attempt_seed,game_core_version,definition_revision,rules_snapshot,reward_snapshot,
       arena_theme_id_snapshot,arena_snapshot,goalkeeper_ready_url,goalkeeper_save_url)
      values($1,$2,'legacy-seed',77,1,$3::jsonb,$4::jsonb,$5,$6::jsonb,$7,$8) returning id`,
      [user.id,game.id,JSON.stringify(rules),JSON.stringify(reward),arena.id,JSON.stringify(rules.arena),game.goalkeeper_ready_url,game.goalkeeper_save_url])).rows[0]!;
    await pool.query(`insert into user_bonus_game_completion(user_id,bonus_game_id,attempt_id,reward_snapshot)
      values($1,$2,$3,$4::jsonb)`, [user.id,game.id,attempt.id,JSON.stringify(reward)]);
    const before = (await pool.query('select u.xp,u.experience,a.balance,a.reserved_balance from users u left join user_currency_account a on a.user_id=u.id where u.id=$1',[user.id])).rows[0];
    await applyMigrations(pool, migrationsDir);
    const credits = await pool.query('select level,source from user_bonus_game_level_completion where user_id=$1 order by level',[user.id]);
    expect(credits.rows).toEqual([1,2,3].map((level) => ({ level, source: 'legacy_credit' })));
    expect((await pool.query('select u.xp,u.experience,a.balance,a.reserved_balance from users u left join user_currency_account a on a.user_id=u.id where u.id=$1',[user.id])).rows[0]).toEqual(before);
    expect((await pool.query('select count(*)::int n from bonus_game_economy_event where user_id=$1',[user.id])).rows[0].n).toBe(0);
    expect((await pool.query('select rules_snapshot,reward_snapshot,challenge_level from bonus_game_attempt where id=$1',[attempt.id])).rows[0])
      .toEqual({ rules_snapshot: rules, reward_snapshot: reward, challenge_level: null });
    expect((await applyMigrations(pool, migrationsDir)).applied).toEqual([]);
    expect((await pool.query('select count(*)::int n from user_bonus_game_level_completion where user_id=$1',[user.id])).rows[0].n).toBe(3);
  });
});
