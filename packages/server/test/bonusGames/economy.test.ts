import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import {
  acknowledgeBonusPreview,
  reconcileCurrentBonusAttempt,
  reconcileOwnedBonusAttempt,
  startBonusPeriod,
  startOrResumeBonusAttempt,
} from '../../src/bonusGames/service.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../db/migrations',
);
const NOW = new Date('2026-09-20T10:00:00.000Z');
const SEED_SECRET = 'endurance-economy-test-secret';

describe.skipIf(!hasIntegrationEnv)('endurance economy-safe reconciliation', () => {
  let pool: Pool;
  let userSequence = 0;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('truncate users, arena_theme restart identity cascade');
    userSequence = 0;
  });

  async function createUser(): Promise<string> {
    userSequence += 1;
    const user = await findOrCreateTelegramUser(pool, {
      providerUid: `endurance-economy-${userSequence}`,
      displayName: `Endurance Economy ${userSequence}`,
      timezone: 'UTC',
    });
    await pool.query('update users set level = 2 where id = $1', [user.id]);
    return user.id;
  }

  async function createGame(): Promise<string> {
    const arena = await pool.query<{ id: string }>(
      `insert into arena_theme
         (slug, title, artwork_url, thumbnail_url, status, is_selectable)
       values ('endurance-test', 'Тест', '/arena.webp', '/arena-thumb.webp', 'active', false)
       returning id`,
    );
    const game = await pool.query<{ id: string }>(
      `insert into bonus_game
         (slug, title, skill_code, description, sort_order, status, access_type,
          unlock_price_stars, target_goals, qualification_rules, total_periods,
          break_duration_ms, period_rules, use_inventory,
          reward_coins, reward_stars, reward_experience, arena_theme_id,
          goalkeeper_ready_url, goalkeeper_save_url, revision)
       values ('endurance-test', 'Выносливость', 'endurance', '', 1, 'active', 'free',
               0, 1, $1::jsonb, 1, 0, $2::jsonb, false,
               0, 1, 1, $3, '/goalie.webp', '/goalie-save.webp', 1)
       returning id`,
      [
        JSON.stringify({
          type: 'survive_goal_windows',
          activeTimeMs: 180_000,
          goalWindowMs: 7_000,
        }),
        JSON.stringify([
          {
            periodNumber: 1,
            durationMs: 180_000,
            shotsLimit: null,
            goalFrequency: 0.5,
            goalieFrequency: 0.6,
            shooterFrequency: 0.75,
            puckSpeedPerMs: 1.25,
            goaliePattern: 'linear',
            goalieAmplitude: 1,
            goalAmplitude: 220,
          },
        ]),
        arena.rows[0]!.id,
      ],
    );
    return game.rows[0]!.id;
  }

  async function startPeriod(userId: string, gameId: string): Promise<string> {
    const created = await startOrResumeBonusAttempt(pool, {
      userId,
      gameId,
      now: NOW,
      seedSecret: SEED_SECRET,
    });
    await acknowledgeBonusPreview(pool, {
      userId,
      attemptId: created.attempt.id,
      dismissFuture: false,
      now: NOW,
    });
    await startBonusPeriod(pool, { userId, attemptId: created.attempt.id, now: NOW });
    return created.attempt.id;
  }

  it('settles concurrent owned reconciliation with one completion and reward', async () => {
    const userId = await createUser();
    const gameId = await createGame();
    const attemptId = await startPeriod(userId, gameId);
    const totalDeadline = new Date(NOW.getTime() + 180_000);
    await pool.query(
      `update bonus_game_attempt
          set goal_window_ends_at = $2
        where id = $1`,
      [attemptId, totalDeadline],
    );

    const attempts = await Promise.all([
      reconcileOwnedBonusAttempt(pool, { userId, attemptId, now: totalDeadline }),
      reconcileOwnedBonusAttempt(pool, { userId, attemptId, now: totalDeadline }),
    ]);

    expect(attempts).toEqual([
      expect.objectContaining({ status: 'completed', rewardGranted: true }),
      expect.objectContaining({ status: 'completed', rewardGranted: true }),
    ]);
    const settled = await pool.query<{
      completions: number;
      rewards: number;
      stars: number;
      experience: number;
    }>(
      `select
         (select count(*)::int from user_bonus_game_completion where attempt_id = $1) as completions,
         (select count(*)::int from bonus_game_economy_event
           where attempt_id = $1 and kind = 'first_clear_reward') as rewards,
         xp::int as stars,
         experience::int
        from users where id = $2`,
      [attemptId, userId],
    );
    expect(settled.rows[0]).toEqual({ completions: 1, rewards: 1, stars: 1, experience: 1 });
  });

  it('commits background expiry before a new start reserves the next attempt', async () => {
    const userId = await createUser();
    const gameId = await createGame();
    const attemptId = await startPeriod(userId, gameId);
    const expiredAt = new Date(NOW.getTime() + 7_000);

    await expect(
      reconcileCurrentBonusAttempt(pool, { userId, now: expiredAt }),
    ).resolves.toBeNull();
    const next = await startOrResumeBonusAttempt(pool, {
      userId,
      gameId,
      now: new Date(expiredAt.getTime() + 1),
      seedSecret: SEED_SECRET,
    });

    expect(next).toMatchObject({ created: true, attempt: { status: 'active', state: 'idle' } });
    const previous = await pool.query<{ status: string }>(
      'select status from bonus_game_attempt where id = $1',
      [attemptId],
    );
    expect(previous.rows[0]?.status).toBe('failed');
  });
});
