import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import {
  ADVANCED_TRAINING_SCENARIOS,
  DEFAULT_MARKSMANSHIP_SCORING_RULES,
  GAME_CORE_VERSION,
  STICK_NEUTRAL,
  classifyMarksmanshipShot,
  createRng,
  deriveShotSeed,
  evaluateAdvancedTrainingShot,
  getGoalie,
  getPerspectiveCourtGoalOpening,
  getSessionPhaseOffsets,
  resolvePerspectiveCourtShot,
  simulateShooter,
  type AdvancedTrainingEvaluation,
  type AdvancedTrainingScenario,
  type ShotInput,
} from '@hockey/game-core';
import { observeCareerExperience } from '../../achievements/service.js';
import { AppError } from '../../plugins/errors.js';
import { assertFullAmateurAccess } from '../../profile/amateurAccess.js';
import { assertGameplayActionAllowed, lockUserGameplay } from '../gameplayLocks.js';
import { getConfiguredDailyPeriodSpeedPreset, getGameSettings } from '../gameSettings.js';
import { deriveAdvancedTrainingSeed } from '../seed.js';
import {
  ADVANCED_TRAINING_EXERCISES,
  buildAdvancedTrainingCatalog,
  fetchAdvancedTrainingCompletions,
  loadAdvancedTrainingConfig,
  type AdvancedTrainingExerciseKey,
} from './advancedCourse.js';
import { isInitialTrainingCompleted } from './initialCourse.js';

const paramsSchema = z.object({ exerciseKey: z.string().min(1).max(80) });
const shotSchema = z.object({
  run_id: z.string().uuid(),
  shot_index: z.number().int().positive(),
  input: z.object({
    tapTime: z.number().finite().min(0),
    shooterTapTime: z.number().finite().min(0).optional(),
  }),
  claimed_result: z.enum(['goal', 'save', 'miss']),
});
const runSchema = z.object({ run_id: z.string().uuid() });

type Stage = 'practice' | 'assessment';
type RunState = 'active' | 'abandoned' | 'completed' | 'failed';

interface RunRow {
  id: string;
  user_id: string;
  exercise_key: AdvancedTrainingExerciseKey;
  state: RunState;
  stage: Stage;
  seed: string;
  scenario_order: string[];
  situation_index: number;
  successes: number;
  series_state: { step?: number };
  game_core_version: number;
  started_at: Date;
  completed_at: Date | null;
}

async function transaction<T>(
  app: { pg: { connect: () => Promise<PoolClient> } },
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await app.pg.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function parseExerciseKey(value: string): AdvancedTrainingExerciseKey {
  const exercise = ADVANCED_TRAINING_EXERCISES.find(({ key }) => key === value);
  if (!exercise) throw new AppError('not_found', 'advanced training exercise not found', 404);
  return exercise.key;
}

function shuffledScenarioOrder(
  exerciseKey: AdvancedTrainingExerciseKey,
  seed: string,
  count: number,
): string[] {
  const source = ADVANCED_TRAINING_SCENARIOS.filter((item) => item.exerciseKey === exerciseKey);
  const rng = createRng(`advanced:${seed}`);
  const result: string[] = [];
  while (result.length < count) {
    const cycle = [...source];
    for (let index = cycle.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(rng.next() * (index + 1));
      [cycle[index], cycle[swap]] = [cycle[swap]!, cycle[index]!];
    }
    result.push(...cycle.map(({ id }) => id));
  }
  return result.slice(0, count);
}

function scenarioFor(run: RunRow): AdvancedTrainingScenario {
  const id = run.scenario_order[run.situation_index];
  const scenario = ADVANCED_TRAINING_SCENARIOS.find((candidate) => candidate.id === id);
  if (!scenario) throw new AppError('advanced_training_scenario_missing', 'scenario not found', 500);
  return scenario;
}

async function assertAccess(
  client: PoolClient,
  userId: string,
  exerciseKey: AdvancedTrainingExerciseKey,
): Promise<void> {
  await assertFullAmateurAccess(client, userId);
  if (!(await isInitialTrainingCompleted(client, userId))) {
    throw new AppError('initial_training_required', 'initial training course is required', 403);
  }
  const config = await loadAdvancedTrainingConfig(client);
  if (!config.enabled) {
    throw new AppError('advanced_training_disabled', 'advanced training is disabled', 409);
  }
  const completed = await fetchAdvancedTrainingCompletions(client, userId);
  const exercise = buildAdvancedTrainingCatalog(completed, true, config).find(
    (candidate) => candidate.key === exerciseKey,
  );
  if (!exercise || exercise.state === 'locked') {
    throw new AppError('advanced_training_exercise_locked', 'advanced training exercise is locked', 409);
  }
}

async function stateDto(client: PoolClient, run: RunRow) {
  const config = await loadAdvancedTrainingConfig(client);
  const settings = await getGameSettings(client);
  const preset = getConfiguredDailyPeriodSpeedPreset(settings.daily.periodSpeedPresets, 1);
  const goalie = getGoalie(settings.training.goalieId);
  const scenario = scenarioFor(run);
  const shotCount = await client.query<{ count: number }>(
    `select count(*)::int as count from advanced_training_shot where run_id = $1`,
    [run.id],
  );
  const totalSituations = run.stage === 'practice' ? config.practiceSituations : config.assessmentSituations;
  return {
    run_id: run.id,
    exercise_key: run.exercise_key,
    stage: run.stage,
    situation_index: run.situation_index,
    total_situations: totalSituations,
    successes: run.successes,
    shots_taken: shotCount.rows[0]?.count ?? 0,
    series_step: run.series_state.step ?? 0,
    scenario,
    seed: run.seed,
    game_core_version: run.game_core_version,
    started_at: run.started_at.toISOString(),
    server_now: new Date().toISOString(),
    scene: {
      goalie_id: goalie.id,
      goalie_config: goalie,
      speeds: {
        shooter_frequency: preset.shooterFrequency,
        goalie_frequency: preset.goalieFrequency,
        goal_frequency: preset.goalFrequency,
        puck_speed_per_ms: preset.puckSpeedPerMs,
      },
    },
  };
}

async function loadRun(client: PoolClient, runId: string, userId: string): Promise<RunRow> {
  const { rows } = await client.query<RunRow>(
    `select id, user_id, exercise_key, state, stage, seed, scenario_order,
            situation_index, successes, series_state, game_core_version, started_at, completed_at
       from advanced_training_run
      where id = $1 and user_id = $2
      for update`,
    [runId, userId],
  );
  const run = rows[0];
  if (!run) throw new AppError('not_found', 'advanced training run not found', 404);
  return run;
}

export const advancedTrainingCourseRoutes: FastifyPluginAsync<{
  trainingSeedSecret: string;
}> = async (app, options) => {
  app.post('/duel/training/advanced/:exerciseKey/start', { preHandler: [app.authenticate] }, async (req) => {
    const parsed = paramsSchema.safeParse(req.params);
    if (!parsed.success) throw new AppError('bad_request', 'invalid exercise key', 400);
    const exerciseKey = parseExerciseKey(parsed.data.exerciseKey);
    return transaction(app, async (client) => {
      await lockUserGameplay(client, req.user.id);
      await assertGameplayActionAllowed(client, { userId: req.user.id, action: 'start_training', now: new Date() });
      await assertAccess(client, req.user.id, exerciseKey);
      const existing = await client.query<RunRow>(
        `select id, user_id, exercise_key, state, stage, seed, scenario_order,
                situation_index, successes, series_state, game_core_version, started_at, completed_at
           from advanced_training_run
          where user_id = $1 and state = 'active'
          for update`,
        [req.user.id],
      );
      const active = existing.rows[0];
      const activeShotCount = active
        ? await client.query<{ count: number }>(
            `select count(*)::int as count from advanced_training_shot where run_id = $1`,
            [active.id],
          )
        : null;
      const canReuseFreshRun =
        active?.exercise_key === exerciseKey &&
        active.game_core_version === GAME_CORE_VERSION &&
        active.stage === 'practice' &&
        active.situation_index === 0 &&
        active.successes === 0 &&
        (activeShotCount?.rows[0]?.count ?? 0) === 0 &&
        (active.series_state.step ?? 0) === 0;
      if (canReuseFreshRun && active) {
        return {
          demonstrations: ADVANCED_TRAINING_SCENARIOS.filter((item) => item.exerciseKey === exerciseKey).slice(0, 2),
          state: await stateDto(client, active),
        };
      }
      if (active) {
        await client.query(`update advanced_training_run set state = 'abandoned' where id = $1`, [active.id]);
      }
      const config = await loadAdvancedTrainingConfig(client);
      const runId = randomUUID();
      const seed = deriveAdvancedTrainingSeed(runId, req.user.id, exerciseKey, options.trainingSeedSecret);
      const order = shuffledScenarioOrder(exerciseKey, seed, Math.max(config.practiceSituations, config.assessmentSituations));
      const inserted = await client.query<RunRow>(
        `insert into advanced_training_run
           (id, user_id, exercise_key, state, stage, seed, scenario_order, game_core_version)
         values ($1, $2, $3, 'active', 'practice', $4, $5::jsonb, $6)
         returning id, user_id, exercise_key, state, stage, seed, scenario_order,
                   situation_index, successes, series_state, game_core_version, started_at, completed_at`,
        [runId, req.user.id, exerciseKey, seed, JSON.stringify(order), GAME_CORE_VERSION],
      );
      return {
        demonstrations: ADVANCED_TRAINING_SCENARIOS.filter((item) => item.exerciseKey === exerciseKey).slice(0, 2),
        state: await stateDto(client, inserted.rows[0]!),
      };
    });
  });

  app.post('/duel/training/advanced/:exerciseKey/practice/restart', { preHandler: [app.authenticate] }, async (req) => {
    const parsedParams = paramsSchema.safeParse(req.params);
    const parsedBody = runSchema.safeParse(req.body);
    if (!parsedParams.success || !parsedBody.success) throw new AppError('bad_request', 'invalid restart payload', 400);
    const exerciseKey = parseExerciseKey(parsedParams.data.exerciseKey);
    return transaction(app, async (client) => {
      const run = await loadRun(client, parsedBody.data.run_id, req.user.id);
      if (run.exercise_key !== exerciseKey || run.state !== 'active') throw new AppError('advanced_training_run_closed', 'run is closed', 409);
      const updated = await client.query<RunRow>(
        `update advanced_training_run set stage = 'practice', situation_index = 0, successes = 0,
                series_state = '{}'::jsonb where id = $1 returning *`,
        [run.id],
      );
      return { state: await stateDto(client, updated.rows[0]!) };
    });
  });

  app.post('/duel/training/advanced/:exerciseKey/assessment/start', { preHandler: [app.authenticate] }, async (req) => {
    const parsedParams = paramsSchema.safeParse(req.params);
    const parsedBody = runSchema.safeParse(req.body);
    if (!parsedParams.success || !parsedBody.success) throw new AppError('bad_request', 'invalid assessment payload', 400);
    const exerciseKey = parseExerciseKey(parsedParams.data.exerciseKey);
    return transaction(app, async (client) => {
      const run = await loadRun(client, parsedBody.data.run_id, req.user.id);
      const config = await loadAdvancedTrainingConfig(client);
      if (run.exercise_key !== exerciseKey || run.state !== 'active' || run.stage !== 'practice' || run.situation_index < config.practiceSituations) {
        throw new AppError('advanced_training_practice_incomplete', 'practice is incomplete', 409);
      }
      const updated = await client.query<RunRow>(
        `update advanced_training_run set stage = 'assessment', situation_index = 0, successes = 0,
                series_state = '{}'::jsonb where id = $1 returning *`,
        [run.id],
      );
      return { state: await stateDto(client, updated.rows[0]!) };
    });
  });

  app.post('/duel/training/advanced/:exerciseKey/shot', { preHandler: [app.authenticate] }, async (req) => {
    const parsedParams = paramsSchema.safeParse(req.params);
    const parsedBody = shotSchema.safeParse(req.body);
    if (!parsedParams.success || !parsedBody.success) throw new AppError('bad_request', 'invalid advanced training shot payload', 400);
    const exerciseKey = parseExerciseKey(parsedParams.data.exerciseKey);
    const body = parsedBody.data;
    return transaction(app, async (client) => {
      await lockUserGameplay(client, req.user.id);
      const run = await loadRun(client, body.run_id, req.user.id);
      if (run.exercise_key !== exerciseKey) throw new AppError('not_found', 'advanced training run not found', 404);
      const replay = await client.query<{ evaluation: { response?: unknown } }>(
        `select evaluation from advanced_training_shot where run_id = $1 and shot_index = $2`,
        [run.id, body.shot_index],
      );
      if (replay.rows[0]?.evaluation.response) return replay.rows[0].evaluation.response;
      if (run.state !== 'active') throw new AppError('advanced_training_run_closed', 'run is closed', 409);
      if (run.game_core_version !== GAME_CORE_VERSION) throw new AppError('advanced_training_game_core_version_mismatch', 'run version mismatch', 409);
      const count = await client.query<{ count: number }>(
        `select count(*)::int as count from advanced_training_shot where run_id = $1`,
        [run.id],
      );
      if (body.shot_index !== (count.rows[0]?.count ?? 0) + 1) throw new AppError('advanced_training_shot_index_mismatch', 'shot index mismatch', 409);
      const config = await loadAdvancedTrainingConfig(client);
      const settings = await getGameSettings(client);
      const preset = getConfiguredDailyPeriodSpeedPreset(settings.daily.periodSpeedPresets, 1);
      const goalie = getGoalie(settings.training.goalieId);
      const shotInput: ShotInput = {
        tapTime: body.input.tapTime,
        ...(body.input.shooterTapTime === undefined ? {} : { shooterTapTime: body.input.shooterTapTime }),
        puckSpeedPerMs: preset.puckSpeedPerMs,
        shooterFrequency: preset.shooterFrequency,
        goalieFrequency: preset.goalieFrequency,
        goalFrequency: preset.goalFrequency,
      };
      const scenario = scenarioFor(run);
      const shotSeed = deriveShotSeed(run.seed, 1, body.shot_index);
      const phaseOffsets = getSessionPhaseOffsets(run.seed);
      const classification = classifyMarksmanshipShot({
        shotInput,
        goalie,
        seed: shotSeed,
        shotIndex: body.shot_index,
        phaseOffsets,
        earliestTapTime: 0,
        scoring: DEFAULT_MARKSMANSHIP_SCORING_RULES,
      });
      const result = resolvePerspectiveCourtShot(shotInput, goalie, shotSeed, body.shot_index, STICK_NEUTRAL, phaseOffsets);
      const evaluation: AdvancedTrainingEvaluation = evaluateAdvancedTrainingShot(scenario, {
        result,
        goalOpening: getPerspectiveCourtGoalOpening(shotInput, goalie, phaseOffsets),
        windowDurationMs: classification.windowDurationMs,
        counterDirection: classification.counterDirection,
        tapOffsetMs: body.input.tapTime - scenario.targetTapTimeMs,
        seriesStep: run.series_state.step ?? 0,
        shooterX: simulateShooter(
          (body.input.shooterTapTime ?? body.input.tapTime) + phaseOffsets.shooter,
          preset.shooterFrequency,
        ).x,
      });
      const totalSituations = run.stage === 'practice' ? config.practiceSituations : config.assessmentSituations;
      const nextSituationIndex = run.situation_index + (evaluation.situationComplete ? 1 : 0);
      const nextSuccesses = run.successes + (evaluation.situationComplete && evaluation.success ? 1 : 0);
      const stageFinished = nextSituationIndex >= totalSituations;
      let completed = false;
      let passed: boolean | null = null;
      let rewardGranted: { stars: number; experience: number } | null = null;
      let nextRun: RunRow;
      if (run.stage === 'assessment' && stageFinished) {
        passed = nextSuccesses >= config.requiredSuccesses;
        completed = passed;
        const updated = await client.query<RunRow>(
          `update advanced_training_run set state = $2, situation_index = $3, successes = $4,
                  series_state = '{}'::jsonb, completed_at = now() where id = $1 returning *`,
          [run.id, passed ? 'completed' : 'failed', nextSituationIndex, nextSuccesses],
        );
        nextRun = updated.rows[0]!;
        if (passed) {
          const completion = await client.query(
            `insert into advanced_training_completion
               (user_id, exercise_key, assessment_successes, reward_stars, reward_experience)
             values ($1, $2, $3, $4, $5)
             on conflict (user_id, exercise_key) do nothing returning exercise_key`,
            [req.user.id, exerciseKey, nextSuccesses, config.rewardStars, config.rewardExperience],
          );
          if (completion.rows[0]) {
            const user = await client.query<{ experience: number }>(
              `update users set xp = xp + $2, experience = experience + $3 where id = $1 returning experience`,
              [req.user.id, config.rewardStars, config.rewardExperience],
            );
            if (config.rewardExperience > 0 && user.rows[0]) {
              await observeCareerExperience(client, req.user.id, {
                eventKey: `advanced-training:${exerciseKey}:reward`,
                occurredAt: new Date(),
                lifetimeTotal: Number(user.rows[0].experience),
              });
            }
            rewardGranted = { stars: config.rewardStars, experience: config.rewardExperience };
          }
        }
      } else {
        const updated = await client.query<RunRow>(
          `update advanced_training_run set situation_index = $2, successes = $3,
                  series_state = $4::jsonb where id = $1 returning *`,
          [run.id, nextSituationIndex, nextSuccesses, JSON.stringify(evaluation.situationComplete ? {} : { step: evaluation.seriesStep })],
        );
        nextRun = updated.rows[0]!;
      }
      const response = {
        server_result: result.type,
        feedback_code: evaluation.feedbackCode,
        situation_complete: evaluation.situationComplete,
        situation_success: evaluation.success,
        stage_finished: stageFinished,
        completed,
        passed,
        reward_granted: rewardGranted,
        state: stageFinished
          ? {
              ...(await stateDto(client, { ...nextRun, situation_index: Math.max(0, totalSituations - 1) })),
              situation_index: nextSituationIndex,
              shots_taken: body.shot_index,
            }
          : { ...(await stateDto(client, nextRun)), shots_taken: body.shot_index },
      };
      await client.query(
        `insert into advanced_training_shot
           (run_id, shot_index, scenario_id, input, server_result, evaluation, game_core_version)
         values ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7)`,
        [run.id, body.shot_index, scenario.id, JSON.stringify(body.input), result.type, JSON.stringify({ ...evaluation, response }), GAME_CORE_VERSION],
      );
      return response;
    });
  });
};
