import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from '../../src/db/migrations.js';
import { runProductionEconomyRebase } from '../../src/ops/productionEconomyRebase.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../db/migrations',
);

const ADMIN_ID = '80cacbe5-d97f-4f48-b4a1-d39fd7946bbe';
const DOG_ANDREY_ID = '32206bf3-0bfd-4e88-ac6d-85b4485dd967';
const PORA_ID = '873d6bd2-294d-49d2-a895-ffa7a352dec5';
const RIVER_ID = '5b9a36a1-6211-438e-95f0-d2e2ce173980';
const PROTECTED_ANDREY_ID = '1df9ce1e-e42f-4a71-a995-abde780d3ba2';
const SURVIVOR_ID = '00000000-0000-4000-8000-000000000122';

describe.skipIf(!hasIntegrationEnv)('production economy rebase operation', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);

    await pool.query(
      `insert into users (id, display_name, timezone, role, xp, experience)
       values ($1, 'Admin', 'Europe/Moscow', 'admin', 0, 0),
              ($2, 'Andrey Rubtsov', 'Europe/Moscow', 'player', 3, 150),
              ($3, 'Пора Белум', 'Europe/Moscow', 'player', 0, 0),
              ($4, 'River 🏔', 'Europe/Moscow', 'player', 0, 0),
              ($5, 'Andrey Rubtsov', 'Europe/Moscow', 'player', 7, 8),
              ($6, 'Survivor', 'Europe/Moscow', 'player', 999, 888)`,
      [ADMIN_ID, DOG_ANDREY_ID, PORA_ID, RIVER_ID, PROTECTED_ANDREY_ID, SURVIVOR_ID],
    );
    await pool.query(
      `insert into auth_providers (id, user_id, provider, provider_uid, provider_data)
       values (gen_random_uuid(), $1, 'vk', '92249804', '{}')`,
      [DOG_ANDREY_ID],
    );
    await pool.query(
      `insert into user_achievements (user_id, achievement_id, completed_at, claimed_at)
       values ($1, 'first-goal', now() - interval '2 days', now() - interval '2 days'),
              ($1, 'amateur-ticket', now() - interval '1 day', null)`,
      [SURVIVOR_ID],
    );
    await pool.query(
      `insert into user_currency_account (user_id, balance, reserved_balance)
       values ($1, 777, 12)`,
      [SURVIVOR_ID],
    );
    await pool.query(`insert into user_reward_token_account (user_id, balance) values ($1, 44)`, [
      SURVIVOR_ID,
    ]);
    await pool.query(
      `insert into currency_ledger
         (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after, metadata)
       values ($1, 'purchase', 777, 0, 777, 0, '{"receipt":"keep-me"}'),
              ($1, 'achievement_reward', 50, 0, 777, 0, '{"achievement_id":"first-goal"}')`,
      [SURVIVOR_ID],
    );

    const chat = await pool.query<{ id: string }>(
      `insert into chats (type, name, created_by) values ('group', 'Keep chat', $1) returning id`,
      [DOG_ANDREY_ID],
    );
    await pool.query(`insert into chat_members (chat_id, user_id) values ($1, $2), ($1, $3)`, [
      chat.rows[0]!.id,
      DOG_ANDREY_ID,
      SURVIVOR_ID,
    ]);
    await pool.query(
      `insert into messages (chat_id, sender_id, content)
       values ($1, $2, 'remove me'), ($1, $3, 'keep me')`,
      [chat.rows[0]!.id, DOG_ANDREY_ID, SURVIVOR_ID],
    );
    const post = await pool.query<{ id: string }>(
      `insert into messages (chat_id, sender_id, content)
       values ($1, $2, 'post') returning id`,
      [chat.rows[0]!.id, SURVIVOR_ID],
    );
    await pool.query(
      `insert into channel_post_comments (post_message_id, author_id, content)
       values ($1, $2, 'remove comment')`,
      [post.rows[0]!.id, PORA_ID],
    );
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('dry-runs, then atomically deletes only targets and rebases rewards once', async () => {
    const dryRun = await runProductionEconomyRebase(pool, { apply: false });
    expect(dryRun).toMatchObject({
      applied: false,
      alreadyApplied: false,
      deletedUsers: 3,
      survivingUsers: 3,
    });
    expect((await pool.query('select count(*)::int as count from users')).rows).toEqual([
      { count: 6 },
    ]);

    const applied = await runProductionEconomyRebase(pool, { apply: true });
    expect(applied).toMatchObject({
      applied: true,
      alreadyApplied: false,
      deletedUsers: 3,
      survivingUsers: 3,
    });
    expect((await pool.query('select id, display_name from users order by id')).rows).toEqual([
      { id: SURVIVOR_ID, display_name: 'Survivor' },
      { id: PROTECTED_ANDREY_ID, display_name: 'Andrey Rubtsov' },
      { id: ADMIN_ID, display_name: 'Admin' },
    ]);
    expect(
      (
        await pool.query(
          `select u.xp::int as stars, u.experience::int as experience,
                  a.balance::int as coins, a.reserved_balance::int as reserved,
                  t.balance::int as tokens
             from users u
             join user_currency_account a on a.user_id = u.id
             join user_reward_token_account t on t.user_id = u.id
            where u.id = $1`,
          [SURVIVOR_ID],
        )
      ).rows,
    ).toEqual([{ stars: 251, experience: 251, coins: 25000, reserved: 0, tokens: 5 }]);
    expect(
      (
        await pool.query(
          'select achievement_id, claimed_at is not null as claimed from user_achievements where user_id=$1 order by achievement_id',
          [SURVIVOR_ID],
        )
      ).rows,
    ).toEqual([
      { achievement_id: 'amateur-ticket', claimed: true },
      { achievement_id: 'first-goal', claimed: true },
    ]);
    expect(
      (
        await pool.query(
          'select achievement_id, amount::int, balance_after::int from achievement_token_ledger where user_id=$1',
          [SURVIVOR_ID],
        )
      ).rows,
    ).toEqual([{ achievement_id: 'amateur-ticket', amount: 5, balance_after: 5 }]);
    expect(
      (
        await pool.query(
          `select reason, metadata->>'receipt' as receipt,
                  metadata->>'operation_key' as operation_key
             from currency_ledger where user_id=$1 order by id`,
          [SURVIVOR_ID],
        )
      ).rows,
    ).toEqual([
      { reason: 'purchase', receipt: 'keep-me', operation_key: null },
      { reason: 'achievement_reward', receipt: null, operation_key: null },
      {
        reason: 'admin_adjustment',
        receipt: null,
        operation_key: '2026-09-11-production-economy-rebase-v1',
      },
    ]);
    expect(
      (
        await pool.query(
          `select c.created_by, array_agg(m.content order by m.content) as messages
             from chats c join messages m on m.chat_id=c.id
            where c.name='Keep chat' group by c.created_by`,
        )
      ).rows,
    ).toEqual([{ created_by: ADMIN_ID, messages: ['keep me', 'post'] }]);
    expect(
      (await pool.query('select count(*)::int as count from channel_post_comments')).rows,
    ).toEqual([{ count: 0 }]);

    const repeated = await runProductionEconomyRebase(pool, { apply: true });
    expect(repeated).toMatchObject({ applied: false, alreadyApplied: true });
    expect(
      (
        await pool.query(
          `select count(*)::int as count from currency_ledger
            where metadata->>'operation_key'='2026-09-11-production-economy-rebase-v1'`,
        )
      ).rows,
    ).toEqual([{ count: 3 }]);
  });
});
