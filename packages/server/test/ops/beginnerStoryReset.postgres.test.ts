import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { loadPublishedVersion } from '../../src/onboarding/service.js';
import { resetBeginnerStory } from '../../src/ops/beginnerStoryReset.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('beginner story reset PostgreSQL contract', () => {
  it('publishes atomically, preserves drafts and progress, and never repeats the reset', async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL required');
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    try {
      // Only session-local temporary tables are visible; public tables are never touched.
      await client.query('set search_path = pg_temp');
      await client.query(`
        create temp table users (id int primary key, beginner_onboarding_completed boolean not null default true,
          beginner_onboarding_reset_at timestamptz, amateur_onboarding_completed boolean default true,
          lifetime_goals_total int default 77);
        create temp table production_data_operations (operation_key text primary key, payload jsonb not null);
        create temp table onboarding_chain (key text primary key, current_published_version_id uuid,
          enforcement_enabled boolean default false, updated_at timestamptz default now());
        create temp table onboarding_version (id uuid primary key default gen_random_uuid(),
          chain_key text references onboarding_chain(key), status text not null, published_at timestamptz);
        create unique index temp_one_draft on onboarding_version(chain_key) where status = 'draft';
        alter table pg_temp.onboarding_chain add foreign key (current_published_version_id) references pg_temp.onboarding_version(id);
        create temp table media_objects (id uuid primary key, original_name text);
        create temp table onboarding_step (id uuid primary key default gen_random_uuid(),
          version_id uuid references onboarding_version(id), position int not null check(position between 1 and 100),
          kind text not null, title text not null, description text not null, cta_label text not null,
          media_object_id uuid, tutorial_config jsonb, unique(version_id, position),
          check(kind = 'tutorial_shot' and media_object_id is null and jsonb_typeof(tutorial_config) = 'object'));
        insert into users(id) values (1), (2);
        insert into onboarding_chain(key) values ('beginner');
        insert into onboarding_version(chain_key, status) values ('beginner', 'draft');
      `);
      const scopedPool = { connect: async () => ({ query: client.query.bind(client), release: () => {} }) } as unknown as Pool;
      expect((await resetBeginnerStory(scopedPool, { apply: false })).usersReset).toBe(2);
      expect((await client.query('select count(*)::int as n from users where beginner_onboarding_completed')).rows[0].n).toBe(2);
      expect((await client.query("select count(*)::int as n from onboarding_version where status = 'published'")).rows[0].n).toBe(0);
      expect((await resetBeginnerStory(scopedPool, { apply: true })).publishedVersionCreated).toBe(true);
      const story = await loadPublishedVersion(client, 'beginner', 'local-test-only');
      expect(story?.steps).toHaveLength(1);
      expect(story?.steps[0]?.kind).toBe('tutorial_shot');
      expect((await client.query("select count(*)::int as n from onboarding_version where status = 'draft'")).rows[0].n).toBe(1);
      expect((await client.query('select count(*)::int as n from users where not beginner_onboarding_completed and amateur_onboarding_completed and lifetime_goals_total = 77')).rows[0].n).toBe(2);
      await client.query('update users set beginner_onboarding_completed = true where id = 1');
      expect((await resetBeginnerStory(scopedPool, { apply: true })).alreadyApplied).toBe(true);
      expect((await client.query('select beginner_onboarding_completed from users where id = 1')).rows[0].beginner_onboarding_completed).toBe(true);
    } finally {
      client.release();
      await pool.end();
    }
  });
});
