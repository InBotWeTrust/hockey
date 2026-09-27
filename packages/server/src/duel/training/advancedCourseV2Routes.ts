import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { ADVANCED_TRAINING_V2_BANK_VERSION, GAME_CORE_VERSION,
  getAdvancedTrainingV2Scenario, type AdvancedTrainingV2Side,
  type AdvancedTrainingV2Stage, type AdvancedTrainingV2Technique } from '@hockey/game-core';
import { AppError } from '../../plugins/errors.js';
import { assertFullAmateurAccess } from '../../profile/amateurAccess.js';
import { assertGameplayActionAllowed, lockUserGameplay } from '../gameplayLocks.js';
import { deriveAdvancedTrainingSeed } from '../seed.js';
import { ADVANCED_TRAINING_V2_EXERCISES, buildAdvancedTrainingV2Catalog,
  fetchAdvancedTrainingV2Completions, loadAdvancedTrainingConfig } from './advancedCourseV2.js';
import { isInitialTrainingCompleted } from './initialCourse.js';

const paramsSchema = z.object({ exerciseKey: z.string().min(1).max(80) });
const stateQuerySchema = z.object({ run_id: z.string().uuid() });

export interface AdvancedTrainingV2Run {
  id: string;
  user_id: string;
  exercise_key: AdvancedTrainingV2Technique;
  state: 'active' | 'abandoned' | 'completed';
  stage: 'practice' | 'assessment';
  side: AdvancedTrainingV2Side;
  side_successes: { left: number; right: number };
  seed: string;
  attempt_ordinal: number;
  shot_index: number;
  game_core_version: number;
  bank_version: number;
}

export function advancedTrainingV2State(run: AdvancedTrainingV2Run) {
  const scenario = getAdvancedTrainingV2Scenario(run.exercise_key, run.side,
    run.stage as AdvancedTrainingV2Stage, run.attempt_ordinal);
  return {
    run_id: run.id, exercise_key: run.exercise_key, stage: run.stage,
    side: run.side, side_successes: run.side_successes, shot_index: run.shot_index,
    scenario_id: scenario.id, scenario, seed: run.seed,
    game_core_version: run.game_core_version, bank_version: run.bank_version,
    server_now: new Date().toISOString(),
  };
}

export function assertAdvancedTrainingV2RunVersion(run: AdvancedTrainingV2Run): void {
  if (run.game_core_version !== GAME_CORE_VERSION || run.bank_version !== ADVANCED_TRAINING_V2_BANK_VERSION) {
    throw new AppError('advanced_training_version_changed', 'Training rules changed. Restart the exercise.', 409);
  }
}

export async function loadAdvancedTrainingV2Run(client: PoolClient, runId: string,
  userId: string): Promise<AdvancedTrainingV2Run> {
  const { rows } = await client.query<AdvancedTrainingV2Run>(
    `select * from advanced_training_v2_run where id = $1 and user_id = $2 for update`, [runId, userId]);
  const run = rows[0];
  if (!run) throw new AppError('not_found', 'advanced training V2 run not found', 404);
  assertAdvancedTrainingV2RunVersion(run);
  return run;
}

function parseExerciseKey(value: string): AdvancedTrainingV2Technique {
  const exercise = ADVANCED_TRAINING_V2_EXERCISES.find(({ key }) => key === value);
  if (!exercise) throw new AppError('not_found', 'advanced training V2 exercise not found', 404);
  return exercise.key;
}

async function transaction<T>(app: { pg: { connect: () => Promise<PoolClient> } },
  fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await app.pg.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export const advancedTrainingV2Routes: FastifyPluginAsync<{ trainingSeedSecret: string }> = async (app, options) => {
  app.post('/duel/training/advanced/v2/:exerciseKey/start', { preHandler: [app.authenticate] }, async (req) => {
    const parsed = paramsSchema.safeParse(req.params);
    if (!parsed.success) throw new AppError('bad_request', 'invalid exercise key', 400);
    const exerciseKey = parseExerciseKey(parsed.data.exerciseKey);
    return transaction(app, async (client) => {
      await lockUserGameplay(client, req.user.id);
      await assertGameplayActionAllowed(client, { userId: req.user.id, action: 'start_training', now: new Date() });
      await assertFullAmateurAccess(client, req.user.id);
      if (!(await isInitialTrainingCompleted(client, req.user.id))) {
        throw new AppError('initial_training_required', 'initial training course is required', 403);
      }
      const config = await loadAdvancedTrainingConfig(client);
      if (!config.enabled) throw new AppError('advanced_training_disabled', 'advanced training is disabled', 409);
      const completed = await fetchAdvancedTrainingV2Completions(client, req.user.id);
      const exercise = buildAdvancedTrainingV2Catalog(completed, true, config)
        .find(({ key }) => key === exerciseKey);
      if (!exercise || exercise.state === 'locked') {
        throw new AppError('advanced_training_exercise_locked', 'advanced training exercise is locked', 409);
      }
      const active = await client.query<AdvancedTrainingV2Run>(
        `select * from advanced_training_v2_run where user_id = $1 and state = 'active' for update`, [req.user.id]);
      const existing = active.rows[0];
      if (existing?.exercise_key === exerciseKey && existing.shot_index === 0 &&
        existing.game_core_version === GAME_CORE_VERSION &&
        existing.bank_version === ADVANCED_TRAINING_V2_BANK_VERSION) {
        return { state: advancedTrainingV2State(existing) };
      }
      await client.query(`update advanced_training_v2_run set state = 'abandoned'
        where user_id = $1 and state = 'active'`, [req.user.id]);
      await client.query(`update advanced_training_run set state = 'abandoned'
        where user_id = $1 and state = 'active'`, [req.user.id]);
      const runId = randomUUID();
      const seed = deriveAdvancedTrainingSeed(runId, req.user.id, exerciseKey, options.trainingSeedSecret);
      const inserted = await client.query<AdvancedTrainingV2Run>(
        `insert into advanced_training_v2_run (id, user_id, exercise_key, state, stage, side,
          seed, game_core_version, bank_version)
         values ($1, $2, $3, 'active', 'practice', 'left', $4, $5, $6) returning *`,
        [runId, req.user.id, exerciseKey, seed, GAME_CORE_VERSION, ADVANCED_TRAINING_V2_BANK_VERSION]);
      return { state: advancedTrainingV2State(inserted.rows[0]!) };
    });
  });

  app.get('/duel/training/advanced/v2/:exerciseKey/state', { preHandler: [app.authenticate] }, async (req) => {
    const parsed = paramsSchema.safeParse(req.params);
    const query = stateQuerySchema.safeParse(req.query);
    if (!parsed.success || !query.success) throw new AppError('bad_request', 'invalid run request', 400);
    const exerciseKey = parseExerciseKey(parsed.data.exerciseKey);
    return transaction(app, async (client) => {
      const run = await loadAdvancedTrainingV2Run(client, query.data.run_id, req.user.id);
      if (run.exercise_key !== exerciseKey) throw new AppError('not_found', 'run not found', 404);
      return { state: advancedTrainingV2State(run) };
    });
  });
};
