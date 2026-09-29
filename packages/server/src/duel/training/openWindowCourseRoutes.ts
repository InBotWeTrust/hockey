import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { GAME_CORE_VERSION, OPEN_WINDOW_BANK_VERSION, OBSERVATION_BANK_VERSION,
  getDailyPeriodSpeedPreset, evaluateOpenWindowDecision, getOpenWindowScene,
  getObservationScene, scanOpenWindows, type ObservationInput, type ObservationStepKey,
  type OpenWindowStepKey } from '@hockey/game-core';
import { observeCareerExperience } from '../../achievements/service.js';
import { AppError } from '../../plugins/errors.js';
import { assertFullAmateurAccess, resolveAmateurAccess } from '../../profile/amateurAccess.js';
import { assertGameplayActionAllowed, lockUserGameplay } from '../gameplayLocks.js';
import { loadAdvancedTrainingConfig } from './advancedCourseV2.js';
import { isInitialTrainingCompleted } from './initialCourse.js';
import { buildOpenWindowCatalog, fetchOpenWindowCompletions,
  parseOpenWindowStepKey } from './openWindowCourse.js';
import { advanceObservationProgress, validateObservationSubmission } from './observationProgress.js';

const paramsSchema = z.object({ stepKey: z.string().min(1).max(80) });
const stateQuerySchema = z.object({ run_id: z.string().uuid() });
const attemptBodySchema = z.object({ run_id: z.string().uuid() });
const finishBodySchema = z.object({ run_id: z.string().uuid(), attempt_token: z.string().uuid() });
const decisionBodySchema = z.object({
  run_id: z.string().uuid(), attempt_token: z.string().uuid(),
  decision_index: z.number().int().positive(), scene_id: z.string().min(1),
  input: z.discriminatedUnion('type', [
    z.object({ type: z.literal('shot'), tap_time_ms: z.number().finite().nonnegative() }),
    z.object({ type: z.literal('skip') }),
    z.object({ type: z.literal('classify'), answer: z.enum(['open', 'closed']) }),
    z.object({ type: z.literal('mark'), tap_time_ms: z.number().finite().nonnegative() }),
    z.object({ type: z.literal('observed') }),
  ]),
});

function isObservationStep(stepKey: OpenWindowStepKey): stepKey is ObservationStepKey {
  return stepKey === 'notice_frame' || stepKey === 'notice_motion' ||
    stepKey === 'notice_independent';
}

function bankVersionFor(stepKey: OpenWindowStepKey): number {
  return isObservationStep(stepKey) ? OBSERVATION_BANK_VERSION : OPEN_WINDOW_BANK_VERSION;
}

interface OpenWindowRun {
  id: string;
  user_id: string;
  step_key: OpenWindowStepKey;
  state: 'active' | 'abandoned' | 'completed';
  phase: 'practice' | 'check';
  scene_variant: number;
  attempt_token: string;
  attempt_index: number;
  decision_index: number;
  sound_count: number;
  practice_decisions: number;
  full_runs: number;
  series_decisions: number;
  shots_taken: number;
  active_elapsed_ms: number;
  skip_recorded: boolean;
  game_core_version: number;
  bank_version: number;
  attempt_started_at: Date | null;
}

function toState(run: OpenWindowRun) {
  const now = new Date();
  const observation = isObservationStep(run.step_key);
  const curatedScene = isObservationStep(run.step_key)
    ? getObservationScene(run.step_key, run.scene_variant)
    : getOpenWindowScene(run.step_key, run.scene_variant);
  return {
    run_id: run.id,
    step_key: run.step_key,
    phase: run.phase,
    scene: run.step_key.startsWith('pace_')
      ? { ...curatedScene, shotIndex: run.shots_taken + 1 } : curatedScene,
    demonstration: observation ? getObservationScene(run.step_key as ObservationStepKey, 0)
      : getOpenWindowScene(run.step_key, 0),
    attempt_token: run.attempt_token,
    attempt_index: run.attempt_index,
    decision_index: run.decision_index,
    sound_count: run.sound_count,
    practice_decisions: run.practice_decisions,
    full_runs: run.full_runs,
    series_decisions: run.series_decisions,
    shots_taken: run.shots_taken,
    active_elapsed_ms: run.attempt_started_at
      ? Math.max(0, now.getTime() - run.attempt_started_at.getTime())
      : run.active_elapsed_ms,
    skip_recorded: run.skip_recorded,
    game_core_version: run.game_core_version,
    bank_version: run.bank_version,
    attempt_started_at: run.attempt_started_at?.toISOString() ?? null,
    server_now: now.toISOString(),
  };
}

async function transaction<T>(app: { pg: { connect: () => Promise<PoolClient> } },
  action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await app.pg.connect();
  try {
    await client.query('begin');
    const result = await action(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

function stepKeyFromParams(value: unknown): OpenWindowStepKey {
  const parsed = paramsSchema.safeParse(value);
  const key = parsed.success ? parseOpenWindowStepKey(parsed.data.stepKey) : null;
  if (!key) throw new AppError('not_found', 'open-window step not found', 404);
  return key;
}

async function lockedRun(client: PoolClient, userId: string, runId: string,
  stepKey: OpenWindowStepKey, allowClosed = false): Promise<OpenWindowRun> {
  const { rows } = await client.query<OpenWindowRun>(
    `select * from open_window_training_run
      where id = $1 and user_id = $2 and step_key = $3 for update`,
    [runId, userId, stepKey]);
  const run = rows[0];
  if (!run) throw new AppError('not_found', 'run not found', 404);
  if (run.state !== 'active' && !allowClosed) {
    throw new AppError('open_window_run_closed', 'run is closed', 409);
  }
  if (run.game_core_version !== GAME_CORE_VERSION ||
    run.bank_version !== bankVersionFor(stepKey)) {
    throw new AppError('open_window_version_changed', 'Restart this lesson', 409);
  }
  return run;
}

async function recordCompletion(client: PoolClient, userId: string,
  stepKey: OpenWindowStepKey): Promise<{ stars: number; experience: number } | null> {
  const stageFinish = (['notice_independent', 'anticipate_timing',
    'decide_sequence', 'pace_three_minutes'] as string[]).includes(stepKey);
  const reward = stageFinish ? 1 : 0;
  const completion = await client.query(
    `insert into open_window_training_completion
       (user_id, step_key, stage, reward_stars, reward_experience)
     values ($1, $2, $3, $4, $4)
     on conflict (user_id, step_key) do nothing returning step_key`,
    [userId, stepKey, stepKey.split('_')[0], reward]);
  if (!completion.rows[0] || !stageFinish) return null;
  const user = await client.query<{ experience: number }>(
    `update users set xp = xp + 1, experience = experience + 1
      where id = $1 returning experience`, [userId]);
  if (user.rows[0]) await observeCareerExperience(client, userId, {
    eventKey: `open-window:${stepKey}:reward`, occurredAt: new Date(),
    lifetimeTotal: Number(user.rows[0].experience),
  });
  return { stars: 1, experience: 1 };
}

export const openWindowCourseRoutes: FastifyPluginAsync = async (app) => {
  app.get('/duel/training/advanced/open-windows/catalog',
    { preHandler: [app.authenticate] }, async (req) => {
      const completed = await fetchOpenWindowCompletions(app.pg, req.user.id);
      const config = await loadAdvancedTrainingConfig(app.pg);
      const access = await resolveAmateurAccess(app.pg, req.user.id);
      const beginnerDone = await isInitialTrainingCompleted(app.pg, req.user.id);
      return buildOpenWindowCatalog(completed,
        config.enabled && access.hasFullAccess && beginnerDone);
    });

  app.post('/duel/training/advanced/open-windows/:stepKey/start',
    { preHandler: [app.authenticate] }, async (req) => {
      const stepKey = stepKeyFromParams(req.params);
      return transaction(app, async (client) => {
        await lockUserGameplay(client, req.user.id);
        await assertGameplayActionAllowed(client, {
          userId: req.user.id, action: 'start_training', now: new Date(),
        });
        await assertFullAmateurAccess(client, req.user.id);
        if (!(await isInitialTrainingCompleted(client, req.user.id))) {
          throw new AppError('initial_training_required', 'initial training is required', 403);
        }
        const config = await loadAdvancedTrainingConfig(client);
        if (!config.enabled) throw new AppError('advanced_training_disabled', 'advanced training disabled', 409);
        const completed = await fetchOpenWindowCompletions(client, req.user.id);
        const step = buildOpenWindowCatalog(completed, true).steps
          .find((candidate) => candidate.key === stepKey);
        if (!step || step.state === 'locked') {
          throw new AppError('open_window_step_locked', 'open-window step locked', 409);
        }
        const active = await client.query<OpenWindowRun>(
          `select * from open_window_training_run where user_id = $1 and state = 'active' for update`,
          [req.user.id]);
        const existing = active.rows[0];
        if (existing?.step_key === stepKey && existing.game_core_version === GAME_CORE_VERSION &&
          existing.bank_version === bankVersionFor(stepKey)) {
          const scene = isObservationStep(stepKey)
            ? getObservationScene(stepKey, existing.scene_variant)
            : getOpenWindowScene(stepKey, existing.scene_variant);
          const restartAttempt = existing.attempt_started_at !== null &&
            (isObservationStep(stepKey) ||
              Date.now() - existing.attempt_started_at.getTime() >
                scene.endMs - scene.startMs + 1000);
          if (restartAttempt) {
            const { rows } = await client.query<OpenWindowRun>(
              `update open_window_training_run set attempt_started_at = null,
                 active_elapsed_ms = 0, attempt_token = $2,
                 skip_recorded = false, series_decisions = 0, shots_taken = 0,
                 sound_count = case when step_key like 'pace_%' then 0 else sound_count end
               where id = $1 returning *`, [existing.id, randomUUID()]);
            return { state: toState(rows[0]!), restarted_due_to_version: false,
              restarted_due_to_timeout: !isObservationStep(stepKey),
              restarted_due_to_reload: isObservationStep(stepKey) };
          }
          return { state: toState(existing), restarted_due_to_version: false,
            restarted_due_to_timeout: false };
        }
        await client.query(`update open_window_training_run set state = 'abandoned'
          where user_id = $1 and state = 'active'`, [req.user.id]);
        await client.query(`update advanced_training_v2_run set state = 'abandoned'
          where user_id = $1 and state = 'active'`, [req.user.id]);
        const inserted = await client.query<OpenWindowRun>(
          `insert into open_window_training_run
            (id, user_id, step_key, state, phase, scene_variant, attempt_token,
             game_core_version, bank_version)
           values ($1, $2, $3, 'active', 'practice', $7, $4, $5, $6)
           returning *`,
          [randomUUID(), req.user.id, stepKey, randomUUID(), GAME_CORE_VERSION,
            bankVersionFor(stepKey), isObservationStep(stepKey) ? 0 : 1]);
        return { state: toState(inserted.rows[0]!), restarted_due_to_version: existing !== undefined };
      });
    });

  app.get('/duel/training/advanced/open-windows/:stepKey/state',
    { preHandler: [app.authenticate] }, async (req) => {
      const stepKey = stepKeyFromParams(req.params);
      const query = stateQuerySchema.safeParse(req.query);
      if (!query.success) throw new AppError('bad_request', 'invalid run request', 400);
      const { rows } = await app.pg.query<OpenWindowRun>(
        `select * from open_window_training_run where id = $1 and user_id = $2 and step_key = $3`,
        [query.data.run_id, req.user.id, stepKey]);
      const run = rows[0];
      if (!run) throw new AppError('not_found', 'run not found', 404);
      if (run.game_core_version !== GAME_CORE_VERSION ||
        run.bank_version !== bankVersionFor(stepKey)) {
        throw new AppError('open_window_version_changed', 'Restart this lesson', 409);
      }
      return { state: toState(run) };
    });

  app.post('/duel/training/advanced/open-windows/:stepKey/attempt/start',
    { preHandler: [app.authenticate] }, async (req) => {
      const stepKey = stepKeyFromParams(req.params);
      const body = attemptBodySchema.safeParse(req.body);
      if (!body.success) throw new AppError('bad_request', 'invalid attempt', 400);
      return transaction(app, async (client) => {
        const run = await lockedRun(client, req.user.id, body.data.run_id, stepKey);
        if (run.attempt_started_at) return { state: toState(run) };
        const { rows } = await client.query<OpenWindowRun>(
          `update open_window_training_run
             set attempt_started_at = now() - (active_elapsed_ms * interval '1 millisecond')
            where id = $1 returning *`, [run.id]);
        return { state: toState(rows[0]!) };
      });
    });

  app.post('/duel/training/advanced/open-windows/:stepKey/finish',
    { preHandler: [app.authenticate] }, async (req) => {
      const stepKey = stepKeyFromParams(req.params);
      const body = finishBodySchema.safeParse(req.body);
      if (!body.success) throw new AppError('bad_request', 'invalid finish request', 400);
      if (!stepKey.startsWith('pace_')) {
        throw new AppError('open_window_finish_unavailable', 'not a continuous series', 409);
      }
      return transaction(app, async (client) => {
        const data = body.data;
        const run = await lockedRun(client, req.user.id, data.run_id, stepKey, true);
        const previous = await client.query<{ response: unknown }>(
          `select response from open_window_training_finish
            where run_id = $1 and attempt_token = $2`, [run.id, data.attempt_token]);
        if (previous.rows[0]) return previous.rows[0].response;
        if (run.state !== 'active' || run.attempt_token !== data.attempt_token ||
          !run.attempt_started_at) {
          throw new AppError('open_window_stale_attempt', 'attempt is no longer active', 409);
        }
        const scene = isObservationStep(stepKey)
          ? getObservationScene(stepKey, run.scene_variant)
          : getOpenWindowScene(stepKey, run.scene_variant);
        const durationMs = scene.endMs - scene.startMs;
        const elapsed = Date.now() - run.attempt_started_at.getTime();
        if (elapsed < durationMs - 250) {
          throw new AppError('open_window_series_incomplete', 'series is still active', 409);
        }
        const isFinal = stepKey === 'pace_three_minutes';
        const sound = run.series_decisions >= 5 && run.sound_count >= 4;
        const practiceReady = isFinal || run.series_decisions >= 5 && run.sound_count >= 3;
        const completed = run.phase === 'check' &&
          (isFinal ? run.full_runs >= 1 : sound);
        const nextPhase = run.phase === 'practice'
          ? practiceReady ? 'check' : 'practice'
          : isFinal || completed ? 'check' : 'practice';
        const nextFullRuns = run.full_runs + Number(isFinal && run.phase === 'check');
        const rewardGranted = completed ? await recordCompletion(client, req.user.id, stepKey) : null;
        const { rows } = await client.query<OpenWindowRun>(
          `update open_window_training_run set
             state = $2, phase = $3, scene_variant = $4,
             attempt_token = $5, attempt_index = attempt_index + 1,
             full_runs = $6, series_decisions = 0, shots_taken = 0,
             sound_count = 0, active_elapsed_ms = 0, attempt_started_at = null,
             completed_at = case when $7 then now() else null end
           where id = $1 returning *`,
          [run.id, completed ? 'completed' : 'active', nextPhase,
            nextPhase === 'check' ? Math.min(6, run.scene_variant + 1) : 1,
            randomUUID(), nextFullRuns, completed]);
        const response = { completed, reward_granted: rewardGranted,
          summary: { decisions: run.series_decisions, sound: run.sound_count,
            shots: run.shots_taken, active_ms: durationMs }, state: toState(rows[0]!) };
        await client.query(`insert into open_window_training_finish
          (run_id, attempt_token, response) values ($1, $2, $3::jsonb)`,
        [run.id, data.attempt_token, JSON.stringify(response)]);
        return response;
      });
    });

  app.post('/duel/training/advanced/open-windows/:stepKey/decision',
    { preHandler: [app.authenticate] }, async (req) => {
      const stepKey = stepKeyFromParams(req.params);
      const body = decisionBodySchema.safeParse(req.body);
      if (!body.success) throw new AppError('bad_request', 'invalid decision', 400);
      return transaction(app, async (client) => {
        const data = body.data;
        const run = await lockedRun(client, req.user.id, data.run_id, stepKey, true);
        const previous = await client.query<{ input: unknown; response: unknown;
          attempt_token: string; scene_id: string }>(
          `select input, response, attempt_token, scene_id from open_window_training_decision
             where run_id = $1 and decision_index = $2`, [run.id, data.decision_index]);
        if (previous.rows[0]) {
          if (previous.rows[0].attempt_token !== data.attempt_token ||
            previous.rows[0].scene_id !== data.scene_id ||
            JSON.stringify(previous.rows[0].input) !== JSON.stringify(data.input)) {
            throw new AppError('open_window_duplicate_conflict', 'decision already recorded', 409);
          }
          return previous.rows[0].response;
        }
        if (run.state !== 'active') {
          throw new AppError('open_window_run_closed', 'run is closed', 409);
        }
        if (data.attempt_token !== run.attempt_token || data.decision_index !== run.decision_index + 1 ||
          !run.attempt_started_at) {
          throw new AppError('open_window_stale_attempt', 'attempt is no longer active', 409);
        }
        if (isObservationStep(stepKey)) {
          if (data.input.type === 'shot' ||
            (stepKey === 'notice_frame' && data.input.type !== 'observed') ||
            (stepKey === 'notice_motion' && data.input.type !== 'classify') ||
            (stepKey === 'notice_independent' &&
              data.input.type !== 'mark' && data.input.type !== 'skip')) {
            throw new AppError('open_window_invalid_decision', 'wrong observation input', 400);
          }
          const scene = getObservationScene(stepKey, run.scene_variant);
          if (data.scene_id !== scene.id) {
            throw new AppError('open_window_scene_mismatch', 'wrong scene', 409);
          }
          const input: ObservationInput = data.input.type === 'mark'
            ? { type: 'mark', tapTimeMs: data.input.tap_time_ms }
            : data.input;
          let evaluation;
          try {
            evaluation = validateObservationSubmission(scene, input,
              Date.now() - run.attempt_started_at.getTime());
          } catch (cause) {
            if (!(cause instanceof RangeError)) throw cause;
            throw new AppError('open_window_invalid_timing', cause.message, 409);
          }
          const progress = advanceObservationProgress(stepKey, run.scene_variant, evaluation);
          const rewardGranted = progress.completed
            ? await recordCompletion(client, req.user.id, stepKey) : null;
          const { rows } = await client.query<OpenWindowRun>(
            `update open_window_training_run set
               state = $2, scene_variant = $3, attempt_token = $4,
               attempt_index = attempt_index + 1, decision_index = $5,
               sound_count = sound_count + $6, practice_decisions = practice_decisions + 1,
               attempt_started_at = null,
               completed_at = case when $7 then now() else null end
             where id = $1 returning *`,
            [run.id, progress.completed ? 'completed' : 'active', progress.nextVariant,
              randomUUID(), data.decision_index, Number(progress.sound), progress.completed]);
          const response = { server_result: null, observation_feedback: evaluation,
            decision_time_ms: data.input.type === 'mark' ? data.input.tap_time_ms : scene.decisionMs,
            sound: progress.sound, completed: progress.completed,
            reward_granted: rewardGranted, state: toState(rows[0]!) };
          await client.query(`insert into open_window_training_decision
            (run_id, decision_index, attempt_token, scene_id, input, evaluation, response)
            values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)`,
          [run.id, data.decision_index, data.attempt_token, scene.id,
            JSON.stringify(data.input), JSON.stringify({ observation: evaluation }),
            JSON.stringify(response)]);
          return response;
        }
        const scene = stepKey.startsWith('pace_')
          ? { ...getOpenWindowScene(stepKey, run.scene_variant), shotIndex: run.shots_taken + 1 }
          : getOpenWindowScene(stepKey, run.scene_variant);
        if (data.scene_id !== scene.id) throw new AppError('open_window_scene_mismatch', 'wrong scene', 409);
        const now = Date.now();
        const elapsed = now - run.attempt_started_at.getTime();
        const sceneTime = scene.startMs + elapsed;
        const traversalMs = 500 / getDailyPeriodSpeedPreset(1).shooterFrequency;
        const partialSkip = stepKey === 'decide_skip' && data.input.type === 'skip' &&
          !run.skip_recorded && sceneTime >= scene.startMs + traversalMs &&
          sceneTime < scene.targetWindow.startMs;
        const tap = data.input.type === 'shot' ? data.input.tap_time_ms :
          partialSkip ? sceneTime : scene.endMs;
        if (tap < scene.startMs || tap > scene.endMs ||
          (data.input.type === 'shot' && Math.abs(sceneTime - tap) > 750) ||
          (data.input.type === 'skip' && !partialSkip && sceneTime < scene.endMs - 250)) {
          throw new AppError('open_window_invalid_timing', 'decision outside active scene', 409);
        }
        const intervalStart = stepKey.startsWith('pace_') && data.input.type === 'shot'
          ? Math.max(scene.startMs, tap - 500)
          : partialSkip ? Math.floor(sceneTime - traversalMs) : scene.startMs;
        const intervalEnd = stepKey.startsWith('pace_') && data.input.type === 'shot'
          ? Math.min(scene.endMs, tap + 500)
          : partialSkip ? Math.floor(sceneTime) : scene.endMs;
        const intervals = scanOpenWindows(scene, intervalStart, intervalEnd);
        const evaluation = evaluateOpenWindowDecision(scene,
          data.input.type === 'shot' ? { type: 'shot', tapTimeMs: tap } : { type: 'skip' }, intervals);
        const sound = data.input.type === 'skip'
          ? evaluation.opportunity === 'sensible_skip' :
          stepKey.startsWith('notice_') ? evaluation.relevant : evaluation.onTime;
        if (partialSkip) {
          const { rows } = await client.query<OpenWindowRun>(
            `update open_window_training_run set
               skip_recorded = true, decision_index = $2, attempt_token = $3
             where id = $1 returning *`, [run.id, data.decision_index, randomUUID()]);
          const response = { server_result: null, evaluation, sound,
            completed: false, reward_granted: null, state: toState(rows[0]!) };
          await client.query(`insert into open_window_training_decision
            (run_id, decision_index, attempt_token, scene_id, input, evaluation, response)
            values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)`,
          [run.id, data.decision_index, data.attempt_token, scene.id,
            JSON.stringify(data.input), JSON.stringify(evaluation), JSON.stringify(response)]);
          return response;
        }
        if (stepKey.startsWith('pace_')) {
          const { rows } = await client.query<OpenWindowRun>(
            `update open_window_training_run set
              decision_index = $2, attempt_token = $3,
              series_decisions = series_decisions + 1,
              shots_taken = shots_taken + $4,
              sound_count = sound_count + $5,
              active_elapsed_ms = $6, attempt_started_at = null
             where id = $1 returning *`,
            [run.id, data.decision_index, randomUUID(), Number(data.input.type === 'shot'),
              Number(sound), tap - scene.startMs]);
          const response = { server_result: evaluation.result, evaluation, sound,
            completed: false, reward_granted: null, state: toState(rows[0]!) };
          await client.query(`insert into open_window_training_decision
            (run_id, decision_index, attempt_token, scene_id, input, evaluation, response)
            values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)`,
          [run.id, data.decision_index, data.attempt_token, scene.id,
            JSON.stringify(data.input), JSON.stringify(evaluation), JSON.stringify(response)]);
          return response;
        }
        const nextPhase = run.phase === 'practice' && sound ? 'check' : run.phase;
        const nextAttempt = run.attempt_index + 1;
        const nextSound = run.phase === 'check' ? run.sound_count + Number(sound) : run.sound_count;
        const finishedCheck = run.phase === 'check' && nextAttempt >= 6;
        const completed = finishedCheck && nextSound >= 4;
        const rewardGranted = completed
          ? await recordCompletion(client, req.user.id, stepKey) : null;
        const { rows } = await client.query<OpenWindowRun>(
          `update open_window_training_run set
             state = $2, phase = $3, scene_variant = $4, attempt_token = $5,
             attempt_index = $6, decision_index = $7, sound_count = $8,
             practice_decisions = practice_decisions + $9, attempt_started_at = null,
             skip_recorded = false,
             completed_at = case when $10 then now() else null end
           where id = $1 returning *`,
          [run.id, completed ? 'completed' : 'active',
            finishedCheck && !completed ? 'practice' : nextPhase,
            nextPhase === 'check' ? Math.min(6, Math.max(2, nextAttempt + 1)) : 1,
            randomUUID(), finishedCheck && !completed ? 0 : nextAttempt,
            data.decision_index, finishedCheck && !completed ? 0 : nextSound,
            Number(run.phase === 'practice'), completed]);
        const response = { server_result: evaluation.result, evaluation, sound,
          completed, reward_granted: rewardGranted, state: toState(rows[0]!) };
        await client.query(`insert into open_window_training_decision
          (run_id, decision_index, attempt_token, scene_id, input, evaluation, response)
          values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)`,
        [run.id, data.decision_index, data.attempt_token, scene.id,
          JSON.stringify(data.input), JSON.stringify(evaluation), JSON.stringify(response)]);
        return response;
      });
    });
};
