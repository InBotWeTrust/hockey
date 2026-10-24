import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { readAchievementSummary } from '../../src/achievements/summary.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = 'performance_achievement_summary_test';
describe.skipIf(!databaseUrl)('stored achievement summary (PostgreSQL)', () => {
  let db: Pool;
  let backfilled: Awaited<ReturnType<typeof readAchievementSummary>>;
  const user = '00000000-0000-4000-8000-000000000001';
  beforeAll(async () => {
    db = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    await db.query(`create schema ${schema}`);
    await db.query(`
      create table users (id uuid primary key);
      create table payments (user_id uuid, status text, paid_at timestamptz);
      create table achievements (id text primary key, availability text not null);
      create table achievement_stages (achievement_id text references achievements on delete cascade,
        stage_number int, is_enabled boolean not null default true, primary key(achievement_id,stage_number));
      create table user_achievements (user_id uuid references users on delete cascade,
        achievement_id text references achievements on delete cascade, completed_at timestamptz,
        claimed_at timestamptz, primary key(user_id,achievement_id));
      create table user_achievement_stages (user_id uuid references users on delete cascade,
        achievement_id text references achievements on delete cascade, stage_number int,
        completed_at timestamptz, claimed_at timestamptz, progress jsonb not null default '{}',
        primary key(user_id,achievement_id,stage_number));
      insert into users values ('${user}');
      insert into achievements values ('single','active'),('chain','active');
      insert into achievement_stages values ('chain',1,true),('chain',2,true),('chain',3,true);
      insert into user_achievements values ('${user}','single',now(),null);
    `);
    await db.query(await readFile(new URL('../../db/migrations/242_achievement_summary.sql', import.meta.url), 'utf8'));
    backfilled = await readAchievementSummary(db, user);
  });
  afterAll(async () => {
    if (db) { await db.query(`drop schema ${schema} cascade`); await db.end(); }
  });
  beforeEach(async () => {
    await db.query('delete from user_achievement_stages');
    await db.query('delete from user_achievements');
    await db.query("delete from achievement_stages where stage_number > 3");
    await db.query("update achievements set availability='active'");
  });
  const summary = () => readAchievementSummary(db, user);
  it('backfills existing users and shared catalogue totals on migration', async () => {
    expect(backfilled).toEqual({ completed: 1, total: 2, levels: { completed: 1, total: 4 } });
    expect(await summary()).toEqual({ completed: 0, total: 2, levels: { completed: 0, total: 4 } });
    expect((await db.query('select count(*)::int as n from user_achievement_summary')).rows[0].n).toBe(1);
  });
  it('tracks completed and claimed stages without double counting rewards', async () => {
    await db.query('insert into user_achievements values ($1,\'single\',now(),null)', [user]);
    await db.query('insert into user_achievement_stages(user_id,achievement_id,stage_number,completed_at) values ($1,\'chain\',1,now())', [user]);
    expect(await summary()).toEqual({ completed: 1, total: 2, levels: { completed: 2, total: 4 } });
    await db.query('update user_achievement_stages set claimed_at=now()');
    expect((await summary()).levels.completed).toBe(2);
    await db.query('insert into user_achievement_stages(user_id,achievement_id,stage_number,completed_at) values ($1,\'chain\',2,now()),($1,\'chain\',3,now())', [user]);
    expect(await summary()).toEqual({ completed: 2, total: 2, levels: { completed: 4, total: 4 } });
    await db.query("update user_achievement_stages set progress='{\"total\":999}'");
    expect((await summary()).levels.completed).toBe(4);
  });
  it('updates shared totals and existing completions when the catalogue changes', async () => {
    await db.query('insert into user_achievements values ($1,\'single\',now(),null)', [user]);
    await db.query('insert into user_achievement_stages(user_id,achievement_id,stage_number,completed_at) select $1,\'chain\',n,now() from generate_series(1,3) n', [user]);
    await db.query("insert into achievement_stages values ('chain',4,true)");
    expect(await summary()).toEqual({ completed: 1, total: 2, levels: { completed: 4, total: 5 } });
    await db.query("update achievements set availability='hidden' where id='single'");
    expect(await summary()).toEqual({ completed: 0, total: 1, levels: { completed: 3, total: 4 } });
    await db.query("delete from achievement_stages where stage_number=4");
    expect(await summary()).toEqual({ completed: 1, total: 1, levels: { completed: 3, total: 3 } });
  });
  it('rolls back counts with progress and serializes concurrent completions', async () => {
    const a = await db.connect(), b = await db.connect();
    try {
      await a.query('begin');
      await a.query('insert into user_achievements values ($1,\'single\',now(),null)', [user]);
      await a.query('rollback');
      expect((await summary()).completed).toBe(0);
      await Promise.all([
        a.query('insert into user_achievements values ($1,\'single\',now(),null)', [user]),
        b.query('insert into user_achievement_stages(user_id,achievement_id,stage_number,completed_at) values ($1,\'chain\',1,now())', [user]),
      ]);
      expect((await summary()).levels.completed).toBe(2);
    } finally { a.release(); b.release(); }
  });
  it('initializes a new player and removes deleted progress', async () => {
    const other = '00000000-0000-4000-8000-000000000002';
    await db.query('insert into users values ($1)', [other]);
    expect(await readAchievementSummary(db, other)).toEqual({ completed: 0, total: 2, levels: { completed: 0, total: 4 } });
    await db.query('insert into user_achievements values ($1,\'single\',now(),null)', [user]);
    await db.query('delete from user_achievements where user_id=$1', [user]);
    expect((await summary()).completed).toBe(0);
    await db.query('delete from users where id=$1', [other]);
  });
});
