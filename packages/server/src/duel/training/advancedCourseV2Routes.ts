import { createHash, randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { ADVANCED_TRAINING_V2_BANK_VERSION, ADVANCED_TRAINING_V2_SCENARIOS, GAME_CORE_VERSION,
  evaluateAdvancedTrainingV2Shot, getAdvancedTrainingV2Scenario, type AdvancedTrainingV2Side,
  type AdvancedTrainingV2Stage, type AdvancedTrainingV2Technique } from '@hockey/game-core';
import { AppError } from '../../plugins/errors.js';
import { observeCareerExperience } from '../../achievements/service.js';
import { assertFullAmateurAccess } from '../../profile/amateurAccess.js';
import { assertGameplayActionAllowed, lockUserGameplay } from '../gameplayLocks.js';
import { deriveAdvancedTrainingSeed } from '../seed.js';
import { ADVANCED_TRAINING_V2_EXERCISES, buildAdvancedTrainingV2Catalog,
  fetchAdvancedTrainingV2Completions, loadAdvancedTrainingConfig } from './advancedCourseV2.js';
import { isInitialTrainingCompleted } from './initialCourse.js';

const paramsSchema = z.object({ exerciseKey: z.string().min(1).max(80) });
const stateQuerySchema = z.object({ run_id: z.string().uuid() });
const runBodySchema = stateQuerySchema;
const shotBodySchema = z.object({
  run_id: z.string().uuid(), shot_index: z.number().int().positive(),
  scenario_id: z.string().min(1),
  input: z.object({ tapTime: z.number().finite().min(0),
    shooterTapTime: z.number().finite().min(0).optional() }),
  claimed_result: z.enum(['goal', 'save', 'miss']),
});

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
  const scenario = scenarioForRun(run);
  return {
    run_id: run.id, exercise_key: run.exercise_key, stage: run.stage,
    side: run.side, side_successes: run.side_successes, shot_index: run.shot_index,
    scenario_id: scenario.id, scenario, seed: run.seed,
    game_core_version: run.game_core_version, bank_version: run.bank_version,
    server_now: new Date().toISOString(),
  };
}

function scenarioForRun(run: AdvancedTrainingV2Run) {
  const matchingCount = ADVANCED_TRAINING_V2_SCENARIOS.filter((candidate) =>
    candidate.technique === run.exercise_key && candidate.side === run.side &&
    candidate.stage === run.stage).length;
  if (matchingCount === 0) throw new AppError('advanced_training_scenario_missing', 'scenario missing', 500);
  const offset = createHash('sha256').update(`${run.seed}:${run.stage}:${run.side}`)
    .digest().readUInt32BE(0) % matchingCount;
  return getAdvancedTrainingV2Scenario(run.exercise_key, run.side,
    run.stage as AdvancedTrainingV2Stage, offset + run.attempt_ordinal);
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
      if (existing?.exercise_key === exerciseKey &&
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

  app.post('/duel/training/advanced/v2/:exerciseKey/assessment/start',
    { preHandler: [app.authenticate] }, async (req) => {
      const parsed = paramsSchema.safeParse(req.params);
      const body = runBodySchema.safeParse(req.body);
      if (!parsed.success || !body.success) throw new AppError('bad_request', 'invalid assessment request', 400);
      const exerciseKey = parseExerciseKey(parsed.data.exerciseKey);
      return transaction(app, async (client) => {
        await lockUserGameplay(client, req.user.id);
        const run = await loadAdvancedTrainingV2Run(client, body.data.run_id, req.user.id);
        if (run.exercise_key !== exerciseKey) throw new AppError('not_found', 'run not found', 404);
        if (run.state !== 'active' || run.stage !== 'practice' ||
          run.side_successes.left < 1 || run.side_successes.right < 1) {
          throw new AppError('advanced_training_practice_incomplete', 'practice is incomplete', 409);
        }
        const updated = await client.query<AdvancedTrainingV2Run>(
          `update advanced_training_v2_run set stage = 'assessment', side = 'left',
            side_successes = '{"left":0,"right":0}'::jsonb, attempt_ordinal = 0
           where id = $1 returning *`, [run.id]);
        return { state: advancedTrainingV2State(updated.rows[0]!) };
      });
    });

  app.post('/duel/training/advanced/v2/:exerciseKey/shot',
    { preHandler: [app.authenticate] }, async (req) => {
      const parsed = paramsSchema.safeParse(req.params);
      const body = shotBodySchema.safeParse(req.body);
      if (!parsed.success || !body.success) throw new AppError('bad_request', 'invalid shot request', 400);
      const exerciseKey = parseExerciseKey(parsed.data.exerciseKey);
      return transaction(app, async (client) => {
        await lockUserGameplay(client, req.user.id);
        const run = await loadAdvancedTrainingV2Run(client, body.data.run_id, req.user.id);
        if (run.exercise_key !== exerciseKey) throw new AppError('not_found', 'run not found', 404);
        const prior = await client.query<{ evaluation: { response: unknown } }>(
          `select evaluation from advanced_training_v2_shot where run_id = $1 and shot_index = $2`,
          [run.id, body.data.shot_index]);
        if (prior.rows[0]) return prior.rows[0].evaluation.response;
        if (run.state !== 'active' || run.stage === 'practice' &&
          run.side_successes.left >= 1 && run.side_successes.right >= 1) {
          throw new AppError('advanced_training_run_closed', 'run is not accepting shots', 409);
        }
        if (body.data.shot_index !== run.shot_index + 1) {
          throw new AppError('advanced_training_shot_index_mismatch', 'shot index mismatch', 409);
        }
        const scenario = scenarioForRun(run);
        if (body.data.scenario_id !== scenario.id) {
          throw new AppError('advanced_training_scenario_mismatch', 'scenario changed; reload the exercise', 409);
        }
        const evaluation = evaluateAdvancedTrainingV2Shot(scenario, {
          tapTime: body.data.input.tapTime,
          ...(body.data.input.shooterTapTime === undefined ? {} :
            { shooterTapTime: body.data.input.shooterTapTime }),
        });
        const successes = { ...run.side_successes };
        if (evaluation.success) successes[run.side] += 1;
        const target = run.stage === 'practice' ? 1 : 2;
        const nextSide = successes.left >= target ? 'right' : 'left';
        const stageFinished = successes.left >= target && successes.right >= target;
        const completed = run.stage === 'assessment' && stageFinished;
        let rewardGranted: { stars: number; experience: number } | null = null;
        if (completed) {
          const config = await loadAdvancedTrainingConfig(client);
          const completion = await client.query(
            `insert into advanced_training_v2_completion
               (user_id, exercise_key, reward_stars, reward_experience)
             values ($1, $2, $3, $4)
             on conflict (user_id, exercise_key) do nothing returning exercise_key`,
            [req.user.id, exerciseKey, config.rewardStars, config.rewardExperience]);
          if (completion.rows[0]) {
            const user = await client.query<{ experience: number }>(
              `update users set xp = xp + $2, experience = experience + $3
                where id = $1 returning experience`,
              [req.user.id, config.rewardStars, config.rewardExperience]);
            if (config.rewardExperience > 0 && user.rows[0]) {
              await observeCareerExperience(client, req.user.id, {
                eventKey: `advanced-training:v2:${exerciseKey}:reward`, occurredAt: new Date(),
                lifetimeTotal: Number(user.rows[0].experience),
              });
            }
            rewardGranted = { stars: config.rewardStars, experience: config.rewardExperience };
          }
        }
        const updated = await client.query<AdvancedTrainingV2Run>(
          `update advanced_training_v2_run set side_successes = $2::jsonb, side = $3,
             attempt_ordinal = attempt_ordinal + 1, shot_index = $4,
             state = $5, completed_at = case when $5 = 'completed' then now() else completed_at end
           where id = $1 returning *`,
          [run.id, JSON.stringify(successes), nextSide, body.data.shot_index,
            completed ? 'completed' : 'active']);
        const response = {
          scenario_id: scenario.id, tap_time: body.data.input.tapTime,
          server_result: evaluation.result.type,
          success: evaluation.success, actual_technique: evaluation.actualTechnique,
          actual_side: evaluation.actualSide, measurements: evaluation.measurements,
          feedback_code: evaluation.success ? 'correct' : evaluation.result.type === 'goal'
            ? 'wrong_category' : evaluation.result.type,
          stage_finished: stageFinished, completed, reward_granted: rewardGranted,
          state: advancedTrainingV2State(updated.rows[0]!),
        };
        await client.query(
          `insert into advanced_training_v2_shot
            (run_id, shot_index, scenario_id, input, server_result, evaluation, game_core_version)
           values ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7)`,
          [run.id, body.data.shot_index, scenario.id, JSON.stringify(body.data.input),
            evaluation.result.type, JSON.stringify({ response }), GAME_CORE_VERSION]);
        return response;
      });
    });
};
