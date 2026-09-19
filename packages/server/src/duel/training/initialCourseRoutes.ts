import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import {
  GAME_CORE_VERSION,
  STICK_NEUTRAL,
  getPerspectiveCourtGoalOpening,
  getGoalie,
  getSessionPhaseOffsets,
  resolvePerspectiveCourtEmptyGoalShot,
  resolvePerspectiveCourtShot,
  simulateShooter,
  type DailyPeriodSpeedPreset,
  type GoalieConfig,
  type SessionPhaseOffsets,
  type ShotInput,
  type ShotResult,
} from '@hockey/game-core';
import { observeCareerExperience } from '../../achievements/service.js';
import { AppError } from '../../plugins/errors.js';
import { appendEvent } from '../eventLog.js';
import {
  assertGameplayActionAllowed,
  getGameplayLockState,
  lockUserGameplay,
  toGameplayLockDto,
} from '../gameplayLocks.js';
import { getConfiguredDailyPeriodSpeedPreset, getGameSettings } from '../gameSettings.js';
import { deriveInitialTrainingSeed, deriveShotSeed } from '../seed.js';
import {
  INITIAL_TRAINING_EXERCISE_KEYS,
  buildInitialTrainingCatalog,
  exerciseSceneForProgress,
  fetchInitialTrainingCompletions,
  fetchInitialTrainingOpenAccess,
  grantInitialTrainingOpenAccess,
  isInitialTrainingCompleted,
  isInitialTrainingExerciseKey,
  loadInitialTrainingConfig,
  resolveInitialTrainingGoalieId,
  type InitialTrainingConfig,
  type InitialTrainingExerciseKey,
} from './initialCourse.js';

const paramsSchema = z.object({ exerciseKey: z.string().min(1).max(80) });
const shotBodySchema = z.object({
  run_id: z.string().uuid(),
  shot_index: z.number().int().min(1),
  input: z.object({
    tapTime: z.number().finite().min(0),
    shooterTapTime: z.number().finite().min(0).optional(),
  }),
  claimed_result: z.enum(['goal', 'save', 'miss']),
});

interface InitialTrainingRunRow {
  id: string;
  user_id: string;
  exercise_key: InitialTrainingExerciseKey;
  state: 'active' | 'abandoned' | 'completed';
  seed: string;
  game_core_version: number;
  started_at: Date;
  completed_at: Date | null;
}

interface InitialTrainingStats {
  shots: number;
  goals: number;
}

interface InitialTrainingShotResponse {
  server_result: ShotResult['type'];
  feedback_code: ReturnType<typeof feedbackCode>;
  completed: boolean;
  reward_granted: { stars: number; experience: number } | null;
  state: {
    run_id: string;
    exercise_key: InitialTrainingExerciseKey;
    shots_taken: number;
    goals: number;
    target_goals: number;
    scene: ReturnType<typeof sceneDto>;
  };
}

async function withTransaction<T>(
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

function parseExerciseKey(value: string): InitialTrainingExerciseKey {
  if (!isInitialTrainingExerciseKey(value)) {
    throw new AppError('not_found', 'initial training exercise not found', 404);
  }
  return value;
}

async function fetchRunStats(
  client: PoolClient,
  runId: string,
): Promise<InitialTrainingStats> {
  const { rows } = await client.query<{ shots: number | string; goals: number | string }>(
    `select count(*)::int as shots,
            count(*) filter (where server_result = 'goal')::int as goals
       from initial_training_shot
      where run_id = $1`,
    [runId],
  );
  return {
    shots: Number(rows[0]?.shots ?? 0),
    goals: Number(rows[0]?.goals ?? 0),
  };
}

function resolvedGoalieConfig(
  base: GoalieConfig,
  preset: DailyPeriodSpeedPreset,
  scene: ReturnType<typeof exerciseSceneForProgress>,
): GoalieConfig {
  return {
    ...base,
    goalOffsetX: scene.goalOffsetX,
    goalAmplitude: scene.movingGoal ? base.goalAmplitude : 0,
    goalFrequency: scene.movingGoal ? preset.goalFrequency : 0,
    frequency: scene.hasGoalie
      ? preset.goalieFrequency * scene.goalieFrequencyMultiplier
      : preset.goalieFrequency,
  };
}

function sceneDto(
  key: InitialTrainingExerciseKey,
  stats: InitialTrainingStats,
  config: InitialTrainingConfig,
  preset: DailyPeriodSpeedPreset,
  baseGoalie: GoalieConfig,
) {
  const scene = exerciseSceneForProgress(
    key,
    { shotIndex: stats.shots + 1, goals: stats.goals },
    config,
  );
  const goalieConfig = resolvedGoalieConfig(baseGoalie, preset, scene);
  return {
    has_goalie: scene.hasGoalie,
    goalie_id: baseGoalie.id,
    goalie_config: goalieConfig,
    speeds: {
      shooter_frequency: preset.shooterFrequency,
      goalie_frequency: goalieConfig.frequency,
      goal_frequency: goalieConfig.goalFrequency,
      puck_speed_per_ms: preset.puckSpeedPerMs,
    },
  };
}

function feedbackCode(
  result: ShotResult,
  input: ShotInput,
  goalieConfig: GoalieConfig,
  offsets: SessionPhaseOffsets,
): 'goal_timing' | 'goalie_blocked' | 'miss_left' | 'miss_right' {
  if (result.type === 'goal') return 'goal_timing';
  if (result.type === 'save') return 'goalie_blocked';
  const shooterTime = input.shooterTapTime ?? input.tapTime;
  const shooterX = simulateShooter(
    shooterTime + offsets.shooter,
    input.shooterFrequency,
  ).x;
  const opening = getPerspectiveCourtGoalOpening(input, goalieConfig, offsets);
  const goalCenter = (opening.xMin + opening.xMax) / 2;
  return shooterX < goalCenter ? 'miss_left' : 'miss_right';
}

export const initialTrainingCourseRoutes: FastifyPluginAsync<{
  trainingSeedSecret: string;
}> = async (app, opts) => {
  app.get('/duel/training/course', { preHandler: [app.authenticate] }, async (req) => {
    return withTransaction(app, async (client) => {
      const config = await loadInitialTrainingConfig(client);
      const completed = await fetchInitialTrainingCompletions(client, req.user.id);
      const beginnerTrainingCompleted = await isInitialTrainingCompleted(client, req.user.id);
      const accessSource = await fetchInitialTrainingOpenAccess(client, req.user.id);
      const gameplayLock = await getGameplayLockState(client, {
        userId: req.user.id,
        action: 'start_training',
        now: new Date(),
      });
      const activeTraining = await client.query<{ active: boolean }>(
        `select exists(
           select 1 from training_session where user_id = $1 and state = 'active'
         ) as active`,
        [req.user.id],
      );
      const exercises = buildInitialTrainingCatalog(completed, config);
      return {
        enabled: config.enabled,
        completed_count: completed.size,
        beginner_training_completed: beginnerTrainingCompleted,
        total_count: INITIAL_TRAINING_EXERCISE_KEYS.length,
        open_training_unlocked:
          !config.enabled || accessSource !== null || activeTraining.rows[0]?.active === true,
        open_training_unlock_source: accessSource,
        gameplay_lock: toGameplayLockDto(gameplayLock),
        exercises,
      };
    });
  });

  app.post(
    '/duel/training/course/:exerciseKey/start',
    { preHandler: [app.authenticate] },
    async (req) => {
      const parsedParams = paramsSchema.safeParse(req.params);
      if (!parsedParams.success) throw new AppError('bad_request', 'invalid exercise key', 400);
      const exerciseKey = parseExerciseKey(parsedParams.data.exerciseKey);
      return withTransaction(app, async (client) => {
        await lockUserGameplay(client, req.user.id);
        const now = new Date();
        await assertGameplayActionAllowed(client, {
          userId: req.user.id,
          action: 'start_training',
          now,
        });
        const config = await loadInitialTrainingConfig(client);
        if (!config.enabled) {
          throw new AppError(
            'initial_training_disabled',
            'initial training course is disabled',
            409,
          );
        }
        const completed = await fetchInitialTrainingCompletions(client, req.user.id);
        const exercise = buildInitialTrainingCatalog(completed, config).find(
          (candidate) => candidate.key === exerciseKey,
        )!;
        if (exercise.state === 'locked') {
          throw new AppError(
            'initial_training_exercise_locked',
            'initial training exercise is locked',
            409,
          );
        }
        await client.query(
          `update initial_training_run
              set state = 'abandoned'
            where user_id = $1 and state = 'active'`,
          [req.user.id],
        );
        const runId = randomUUID();
        const seed = deriveInitialTrainingSeed(
          runId,
          req.user.id,
          exerciseKey,
          opts.trainingSeedSecret,
        );
        const { rows } = await client.query<InitialTrainingRunRow>(
          `insert into initial_training_run
             (id, user_id, exercise_key, state, seed, game_core_version, started_at)
           values ($1, $2, $3, 'active', $4, $5, $6)
           returning id, user_id, exercise_key, state, seed, game_core_version,
                     started_at, completed_at`,
          [runId, req.user.id, exerciseKey, seed, GAME_CORE_VERSION, now],
        );
        const settings = await getGameSettings(client);
        const preset = getConfiguredDailyPeriodSpeedPreset(
          settings.daily.periodSpeedPresets,
          1,
        );
        return {
          run_id: runId,
          exercise,
          seed,
          game_core_version: GAME_CORE_VERSION,
          shots_taken: 0,
          goals: 0,
          target_goals: exercise.targetGoals,
          started_at: rows[0]!.started_at.toISOString(),
          server_now: now.toISOString(),
          scene: sceneDto(
            exerciseKey,
            { shots: 0, goals: 0 },
            config,
            preset,
            getGoalie(resolveInitialTrainingGoalieId(settings.training.goalieId)),
          ),
        };
      });
    },
  );

  app.post(
    '/duel/training/course/:exerciseKey/shot',
    { preHandler: [app.authenticate] },
    async (req) => {
      const parsedParams = paramsSchema.safeParse(req.params);
      const parsedBody = shotBodySchema.safeParse(req.body);
      if (!parsedParams.success || !parsedBody.success) {
        throw new AppError('bad_request', 'invalid initial training shot payload', 400);
      }
      const exerciseKey = parseExerciseKey(parsedParams.data.exerciseKey);
      const body = parsedBody.data;
      return withTransaction(app, async (client) => {
        await lockUserGameplay(client, req.user.id);
        const now = new Date();
        await assertGameplayActionAllowed(client, {
          userId: req.user.id,
          action: 'start_training',
          now,
        });
        const { rows } = await client.query<InitialTrainingRunRow>(
          `select id, user_id, exercise_key, state, seed, game_core_version,
                  started_at, completed_at
             from initial_training_run
            where id = $1 and user_id = $2
            for update`,
          [body.run_id, req.user.id],
        );
        const run = rows[0];
        if (!run || run.exercise_key !== exerciseKey) {
          throw new AppError('not_found', 'initial training run not found', 404);
        }
        const replay = await client.query<{ response_payload: InitialTrainingShotResponse }>(
          `select response_payload
             from initial_training_shot
            where run_id = $1 and shot_index = $2`,
          [run.id, body.shot_index],
        );
        if (replay.rows[0]) return replay.rows[0].response_payload;
        if (run.state !== 'active') {
          throw new AppError('initial_training_run_closed', 'initial training run is closed', 409);
        }
        if (run.game_core_version !== GAME_CORE_VERSION) {
          throw new AppError(
            'initial_training_game_core_version_mismatch',
            'initial training run uses an outdated game core version',
            409,
          );
        }
        const stats = await fetchRunStats(client, run.id);
        const expectedShotIndex = stats.shots + 1;
        if (body.shot_index !== expectedShotIndex) {
          throw new AppError(
            'initial_training_shot_index_mismatch',
            `shot_index mismatch: expected ${expectedShotIndex}`,
            409,
          );
        }
        const config = await loadInitialTrainingConfig(client);
        const settings = await getGameSettings(client);
        const preset = getConfiguredDailyPeriodSpeedPreset(
          settings.daily.periodSpeedPresets,
          1,
        );
        const scene = exerciseSceneForProgress(
          exerciseKey,
          { shotIndex: expectedShotIndex, goals: stats.goals },
          config,
        );
        const goalieConfig = resolvedGoalieConfig(
          getGoalie(resolveInitialTrainingGoalieId(settings.training.goalieId)),
          preset,
          scene,
        );
        const shotInput: ShotInput = {
          tapTime: body.input.tapTime,
          ...(body.input.shooterTapTime === undefined
            ? {}
            : { shooterTapTime: body.input.shooterTapTime }),
          puckSpeedPerMs: preset.puckSpeedPerMs,
          shooterFrequency: preset.shooterFrequency,
          goalieFrequency: goalieConfig.frequency,
          goalFrequency: goalieConfig.goalFrequency,
        };
        const shotSeed = deriveShotSeed(run.seed, 1, expectedShotIndex);
        const offsets = getSessionPhaseOffsets(run.seed);
        const result = scene.hasGoalie
          ? resolvePerspectiveCourtShot(
              shotInput,
              goalieConfig,
              shotSeed,
              expectedShotIndex,
              STICK_NEUTRAL,
              offsets,
            )
          : resolvePerspectiveCourtEmptyGoalShot(shotInput, goalieConfig, offsets);
        if (body.claimed_result !== result.type) {
          await appendEvent(client, req.user.id, 'shot_mismatch', {
            mode: 'initial_training',
            run_id: run.id,
            exercise_key: exerciseKey,
            shot_index: expectedShotIndex,
            claimed_result: body.claimed_result,
            server_result: result.type,
          });
        }
        const nextStats = {
          shots: expectedShotIndex,
          goals: stats.goals + (result.type === 'goal' ? 1 : 0),
        };
        const targetGoals = config.targetGoals[exerciseKey];
        const completed = nextStats.goals >= targetGoals;
        let rewardGranted: { stars: number; experience: number } | null = null;
        if (completed) {
          await client.query(
            `update initial_training_run
                set state = 'completed', completed_at = $2
              where id = $1`,
            [run.id, now],
          );
          const completion = await client.query<{ exercise_key: string }>(
            `insert into initial_training_completion
               (user_id, exercise_key, completed_at, reward_stars, reward_experience)
             values ($1, $2, $3, $4, $5)
             on conflict (user_id, exercise_key) do nothing
             returning exercise_key`,
            [
              req.user.id,
              exerciseKey,
              now,
              config.rewardStars,
              config.rewardExperience,
            ],
          );
          if (completion.rows[0]) {
            const user = await client.query<{ experience: number }>(
              `update users
                  set xp = xp + $2,
                      experience = experience + $3
                where id = $1
                returning experience`,
              [req.user.id, config.rewardStars, config.rewardExperience],
            );
            if (user.rows[0] === undefined) {
              throw new AppError('not_found', 'user not found', 404);
            }
            if (config.rewardExperience > 0) {
              await observeCareerExperience(client, req.user.id, {
                eventKey: `initial-training:${exerciseKey}:reward`,
                occurredAt: now,
                lifetimeTotal: Number(user.rows[0].experience),
              });
            }
            rewardGranted = {
              stars: config.rewardStars,
              experience: config.rewardExperience,
            };
          }
          const completions = await fetchInitialTrainingCompletions(client, req.user.id);
          if (completions.size === INITIAL_TRAINING_EXERCISE_KEYS.length) {
            await grantInitialTrainingOpenAccess(client, req.user.id, 'course', now);
          }
        }
        const response: InitialTrainingShotResponse = {
          server_result: result.type,
          feedback_code: feedbackCode(result, shotInput, goalieConfig, offsets),
          completed,
          reward_granted: rewardGranted,
          state: {
            run_id: run.id,
            exercise_key: exerciseKey,
            shots_taken: nextStats.shots,
            goals: nextStats.goals,
            target_goals: targetGoals,
            scene: sceneDto(
              exerciseKey,
              nextStats,
              config,
              preset,
              getGoalie(resolveInitialTrainingGoalieId(settings.training.goalieId)),
            ),
          },
        };
        await client.query(
          `insert into initial_training_shot
             (run_id, user_id, shot_index, seed, input_payload, server_result,
              response_payload, game_core_version, created_at)
           values ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9)`,
          [
            run.id,
            req.user.id,
            expectedShotIndex,
            shotSeed,
            JSON.stringify(shotInput),
            result.type,
            JSON.stringify(response),
            run.game_core_version,
            now,
          ],
        );
        return response;
      });
    },
  );
};
