import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { startOrResumeBonusAttempt } from '../../src/bonusGames/service.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const migrations = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations');
const selected = new Set([
  '154_marksmanship_single_category_scoring.sql', '155_marksmanship_visible_techniques.sql',
  '161_marksmanship_scoring_v5.sql', '162_marksmanship_scoring_v6.sql',
  '163_easier_bonus_challenges.sql', '168_bonus_hockey_city_tours.sql',
  '169_bonus_nhl_city_tours.sql', '170_swap_bonus_city_tours.sql',
  '171_extend_accuracy_game_time.sql', '172_bonus_challenges.sql',
  '173_rebalance_bonus_challenges.sql',
]);

describe.skipIf(!hasIntegrationEnv)('bonus-only production migration', () => {
  it('preserves existing game IDs, progress and attempt snapshots over the main schema', async () => {
    const pool = createTestPool();
    const baseline = await mkdtemp(path.join(tmpdir(), 'hockey-bonus-main-schema-'));
    try {
      await resetDatabase(pool);
      for (const name of await readdir(migrations)) {
        if (name.endsWith('.sql') && !selected.has(name)) {
          await copyFile(path.join(migrations, name), path.join(baseline, name));
        }
      }
      await applyMigrations(pool, baseline);
      const user = await findOrCreateTelegramUser(pool, {
        providerUid: 'isolated-bonus-production-migration', displayName: 'Migration fixture',
        timezone: 'Europe/Moscow',
      });
      await pool.query('update users set level=2 where id=$1', [user.id]);
      const ids = await pool.query<{ id: string }>('select id from bonus_game order by id');
      const first = await pool.query<{ id: string }>("select id from bonus_game where skill_code='speed' and sort_order=1");
      const activeId = randomUUID();
      const historicId = randomUUID();
      // Seed attempts using the pre-release schema, not a service requiring new columns.
      for (const [id, status, state] of [[activeId, 'active', 'idle'], [historicId, 'completed', 'closed']]) {
        await pool.query(`insert into bonus_game_attempt
          (id,user_id,bonus_game_id,status,state,attempt_seed,game_core_version,
           definition_revision,rules_snapshot,reward_snapshot,arena_theme_id_snapshot,
           arena_snapshot,goalkeeper_ready_url,goalkeeper_save_url)
          select $1,$2,g.id,$3,$4,'legacy-production-fixture',63,g.revision,
            jsonb_build_object('gameId',g.id,'slug',g.slug,'title',g.title,
              'skillCode',g.skill_code,'revision',g.revision,'targetGoals',g.target_goals,
              'qualificationRules',g.qualification_rules,'totalPeriods',g.total_periods,
              'breakDurationMs',g.break_duration_ms,'useInventory',g.use_inventory,
              'previewTitle',g.preview_title,'previewStory',g.preview_story,
              'previewArtworkUrl',g.preview_artwork_url,'previewRevision',g.preview_revision,
              'periods',g.period_rules,'goalkeeperReadyUrl',g.goalkeeper_ready_url,
              'goalkeeperSaveUrl',g.goalkeeper_save_url,'arena',a.snapshot),
            jsonb_build_object('coins',g.reward_coins,'stars',g.reward_stars,'experience',g.reward_experience),
            g.arena_theme_id,a.snapshot,g.goalkeeper_ready_url,g.goalkeeper_save_url
          from bonus_game g join lateral (
            select jsonb_build_object('id',theme.id,'slug',theme.slug,'title',theme.title,
              'artworkUrl',theme.artwork_url,'thumbnailUrl',theme.thumbnail_url) as snapshot
            from arena_theme theme where theme.id=g.arena_theme_id
          ) a on true where g.id=$5`,
        [id, user.id, status, state, first.rows[0]!.id]);
      }
      const oldAttempt = await pool.query('select * from bonus_game_attempt where user_id=$1 order by id', [user.id]);
      // A historical completion must not be reset when its catalog art changes.
      await pool.query(`insert into user_bonus_game_completion (user_id,bonus_game_id,attempt_id,reward_snapshot)
        values ($1,$2,$3,'{"coins":100,"stars":5,"experience":5}')`,
      [user.id, first.rows[0]!.id, historicId]);
      const progress = await pool.query('select * from user_bonus_game_completion where user_id=$1', [user.id]);
      const applied = await applyMigrations(pool, migrations);
      expect(new Set(applied.applied)).toEqual(selected);
      expect((await pool.query('select * from bonus_game_attempt where user_id=$1 order by id', [user.id])).rows).toEqual(oldAttempt.rows);
      expect((await pool.query('select * from user_bonus_game_completion where user_id=$1', [user.id])).rows).toEqual(progress.rows);
      const afterIds = new Set((await pool.query<{ id: string }>('select id from bonus_game')).rows.map(row => row.id));
      for (const { id } of ids.rows) expect(afterIds.has(id)).toBe(true);
      const counts = await pool.query("select skill_code,count(*)::int as count from bonus_game where status='active' group by skill_code order by skill_code");
      expect(counts.rows).toEqual([
        { skill_code: 'accuracy', count: 10 }, { skill_code: 'challenge', count: 10 },
        { skill_code: 'endurance', count: 10 }, { skill_code: 'marksmanship', count: 10 },
        { skill_code: 'speed', count: 10 },
      ]);
      const routes = await pool.query<{ skill_code: string; cities: string[] }>(
        "select skill_code,array_agg(title order by sort_order) as cities from bonus_game where status='active' and skill_code<>'challenge' group by skill_code order by skill_code");
      expect(routes.rows).toEqual([
        { skill_code: 'accuracy', cities: ['Астана', 'Нижнекамск', 'Новосибирск', 'Владивосток', 'Хабаровск', 'Уфа', 'Екатеринбург', 'Омск', 'Челябинск', 'Магнитогорск'] },
        { skill_code: 'endurance', cities: ['Даллас', 'Денвер', 'Солт-Лейк-Сити', 'Виннипег', 'Эдмонтон', 'Калгари', 'Ванкувер', 'Сиэтл', 'Лос-Анджелес', 'Лас-Вегас'] },
        { skill_code: 'marksmanship', cities: ['Торонто', 'Монреаль', 'Бостон', 'Нью-Йоркская агломерация', 'Филадельфия', 'Вашингтон', 'Питтсбург', 'Детройт', 'Чикаго', 'Нэшвилл'] },
        { skill_code: 'speed', cities: ['Минск', 'Шанхай', 'Сочи', 'Тольятти', 'Москва', 'Нижний Новгород', 'Череповец', 'Ярославль', 'Казань', 'Санкт-Петербург'] },
      ]);
      const resumed = await startOrResumeBonusAttempt(pool, {
        userId: user.id, gameId: first.rows[0]!.id, now: new Date(),
        seedSecret: 'isolated-migration-seed-secret', dailyAttemptLimit: 2,
      });
      expect(resumed.created).toBe(false);
      expect(resumed.attempt.gameCoreVersion).toBe(63);
      expect(resumed.attempt.rules).toEqual(oldAttempt.rows.find(row => row.id === activeId)!.rules_snapshot);
      expect((await applyMigrations(pool, migrations)).applied).toEqual([]);
    } finally {
      await pool.end();
      await rm(baseline, { recursive: true, force: true });
    }
  }, 30_000);
});
