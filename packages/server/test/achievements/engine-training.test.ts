import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { evaluateTrainingClosedAchievements } from '../../src/achievements/engine.js';
import { applyMigrations } from '../../src/db/migrations.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

type ShotResult = 'goal' | 'save' | 'miss';

describe.skipIf(!hasIntegrationEnv)('training achievement evaluator', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('completes exact-50 training achievements and first-training', async () => {
    const userId = await createUser(pool);
    const trainingSessionId = await seedClosedTraining(pool, {
      userId,
      dayDate: '2026-05-31',
      results: [...makeResults(20, 20), ...makeResults(29, 29), 'save'],
    });

    await evaluateTrainingClosedAchievements(pool, {
      userId,
      trainingSessionId,
      dayDate: '2026-05-31',
      shotsLimit: 50,
    });

    await expect(completedIds(pool, userId)).resolves.toEqual(
      expect.arrayContaining([
        'first-training',
        'training-monster',
        'almost-perfect-training',
        'rhythm-control',
        'no-warmup-needed',
      ]),
    );
  });

  it('uses actual shots_limit for finish-machine last 20 shots', async () => {
    const userId = await createUser(pool);
    const trainingSessionId = await seedClosedTraining(pool, {
      userId,
      dayDate: '2026-05-31',
      results: [...makeResults(5, 0), ...makeResults(20, 20)],
    });

    await evaluateTrainingClosedAchievements(pool, {
      userId,
      trainingSessionId,
      dayDate: '2026-05-31',
      shotsLimit: 25,
    });

    await expect(completedIds(pool, userId)).resolves.toContain('finish-machine');
  });

  it('completes stable-student after five distinct 40-of-50 trainings', async () => {
    const userId = await createUser(pool);

    for (let day = 1; day <= 5; day += 1) {
      const trainingSessionId = await seedClosedTraining(pool, {
        userId,
        dayDate: `2026-05-0${day}`,
        results: makeResults(50, 40),
      });
      await evaluateTrainingClosedAchievements(pool, {
        userId,
        trainingSessionId,
        dayDate: `2026-05-0${day}`,
        shotsLimit: 50,
      });
      await evaluateTrainingClosedAchievements(pool, {
        userId,
        trainingSessionId,
        dayDate: `2026-05-0${day}`,
        shotsLimit: 50,
      });
    }

    await expect(completedIds(pool, userId)).resolves.toContain('stable-student');
    await expect(trainingStreakProgress(pool, userId)).resolves.toMatchObject({ count: 5 });
  });
});

function makeResults(total: number, goals: number): ShotResult[] {
  return Array.from({ length: total }, (_, index) => (index < goals ? 'goal' : 'save'));
}

async function createUser(pool: Pool): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into users (id, display_name, avatar_url, level, timezone)
     values ($1, 'Training Achiever', null, 1, 'UTC')`,
    [id],
  );
  return id;
}

async function seedClosedTraining(
  pool: Pool,
  input: { userId: string; dayDate: string; results: ShotResult[] },
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into training_session
       (user_id, day_date, selected_period, state, game_core_version, training_seed, closed_at)
     values ($1, $2::date, 1, 'closed', 1, $3, now())
     returning id`,
    [input.userId, input.dayDate, `training-${input.dayDate}-${randomUUID()}`],
  );
  const trainingSessionId = rows[0]!.id;

  await pool.query(
    `insert into shot_session
       (user_id, mode, training_session_id, period_number, shot_index, seed,
        input_payload, server_result, game_core_version)
     select $1::uuid,
            'training',
            $2::uuid,
            1,
            n,
            'training-shot-' || $2::text || '-' || n::text,
            '{}'::jsonb,
            result,
            1
       from unnest($3::text[]) with ordinality as shot(result, n)`,
    [input.userId, trainingSessionId, input.results],
  );

  return trainingSessionId;
}

async function completedIds(pool: Pool, userId: string): Promise<string[]> {
  const { rows } = await pool.query<{ achievement_id: string }>(
    `select achievement_id
       from user_achievements
      where user_id = $1
      order by achievement_id asc`,
    [userId],
  );
  return rows.map((row) => row.achievement_id);
}

async function trainingStreakProgress(pool: Pool, userId: string): Promise<unknown> {
  const { rows } = await pool.query<{ state: unknown }>(
    `select state
       from achievement_progress
      where user_id = $1 and key = 'training_40_of_50_streak'`,
    [userId],
  );
  return rows[0]?.state ?? null;
}
