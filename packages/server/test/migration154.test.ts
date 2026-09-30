import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestPool, hasIntegrationEnv, resetDatabase } from './helpers/testDb.js';
import { applyMigrationsThrough } from './helpers/migrations.js';

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../db/migrations');

describe.skipIf(!hasIntegrationEnv)('migration 154 existing accepted duels', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrationsThrough(pool, migrationsDir, '153_initial_training_position_drills.sql');
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('reserves both players in accepted ready-check duels but not unanswered invitations', async () => {
    const users = [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ];
    await pool.query(
      "insert into users(id, display_name, timezone) values($1, 'Challenger', 'Europe/Moscow'), ($2, 'Opponent', 'Europe/Moscow')",
      users,
    );
    const unansweredOpponent = '00000000-0000-4000-8000-000000000003';
    await pool.query(
      "insert into users(id, display_name, timezone) values($1, 'Unanswered', 'Europe/Moscow')",
      [unansweredOpponent],
    );
    const ready = await pool.query<{ id: string }>(
      `insert into amateur_duel_match
       (challenger_user_id, opponent_user_id, status, season_key, duel_kind, rules_snapshot,
        match_seed, starts_at, ends_at, game_core_version, updated_at)
       values ($1, $2, 'ready_check', '2026-09', 'express', '{}', 'ready',
               '2026-09-22T12:00:00Z', '2026-09-22T13:00:00Z', 1,
               '2026-09-22T12:00:00Z') returning id`,
      users,
    );
    const invited = await pool.query<{ id: string }>(
      `insert into amateur_duel_match
       (challenger_user_id, opponent_user_id, status, season_key, duel_kind, rules_snapshot,
        match_seed, starts_at, ends_at, game_core_version)
       values ($1, $2, 'invited', '2026-09', 'express', '{}', 'invited',
               '2026-09-22T12:00:00Z', '2026-09-22T13:00:00Z', 1) returning id`,
      [users[0], unansweredOpponent],
    );
    const finished = await pool.query<{ id: string }>(
      `insert into amateur_duel_match
       (challenger_user_id, opponent_user_id, status, season_key, duel_kind, rules_snapshot,
        match_seed, starts_at, ends_at, game_core_version, accepted_at)
       values ($1, $2, 'cancelled', '2026-09', 'classic', '{}', 'started',
               '2026-09-22T10:00:00Z', '2026-09-22T11:00:00Z', 1,
               '2026-09-22T10:00:00Z') returning id`,
      users,
    );
    for (const [matchId, state, opponentId] of [
      [ready.rows[0]!.id, 'loadout_pending', users[1]],
      [invited.rows[0]!.id, 'invited', unansweredOpponent],
      [finished.rows[0]!.id, 'forfeit', users[1]],
    ]) {
      await pool.query(
        `insert into amateur_duel_participant(match_id, user_id, side, state)
         values ($1, $2, 'challenger', $4), ($1, $3, 'opponent', $4)`,
        [matchId, users[0], opponentId, state],
      );
    }

    await applyMigrationsThrough(pool, migrationsDir, '154_amateur_duel_limit_reservations.sql');
    const { rows } = await pool.query(
      'select match_id, user_id, accepted_at from amateur_duel_limit_reservation order by accepted_at, user_id',
    );
    expect(rows).toEqual([
      ...users.map((userId) => ({
        match_id: finished.rows[0]!.id,
        user_id: userId,
        accepted_at: new Date('2026-09-22T10:00:00Z'),
      })),
      ...users.map((userId) => ({
        match_id: ready.rows[0]!.id,
        user_id: userId,
        accepted_at: new Date('2026-09-22T12:00:00Z'),
      })),
    ]);
  });
});
