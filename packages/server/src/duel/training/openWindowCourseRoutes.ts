import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { GAME_CORE_VERSION, OPEN_WINDOW_BANK_VERSION,
  evaluateOpenWindowDecision, getOpenWindowScene, scanOpenWindows,
  type OpenWindowStepKey } from '@hockey/game-core';
import { observeCareerExperience } from '../../achievements/service.js';
import { AppError } from '../../plugins/errors.js';
import { assertFullAmateurAccess, resolveAmateurAccess } from '../../profile/amateurAccess.js';
import { assertGameplayActionAllowed, lockUserGameplay } from '../gameplayLocks.js';
import { loadAdvancedTrainingConfig } from './advancedCourseV2.js';
import { isInitialTrainingCompleted } from './initialCourse.js';
import { buildOpenWindowCatalog, fetchOpenWindowCompletions,
  parseOpenWindowStepKey } from './openWindowCourse.js';

const paramsSchema = z.object({ stepKey: z.string().min(1).max(80) });
const stateQuerySchema = z.object({ run_id: z.string().uuid() });
const attemptBodySchema = z.object({ run_id: z.string().uuid() });
const decisionBodySchema = z.object({
  run_id: z.string().uuid(), attempt_token: z.string().uuid(),
  decision_index: z.number().int().positive(), scene_id: z.string().min(1),
  input: z.discriminatedUnion('type', [
    z.object({ type: z.literal('shot'), tap_time_ms: z.number().finite().nonnegative() }),
    z.object({ type: z.literal('skip') }),
  ]),
});

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
  game_core_version: number;
  bank_version: number;
  attempt_started_at: Date | null;
}

function toState(run: OpenWindowRun) {
  return {
    run_id: run.id,
    step_key: run.step_key,
    phase: run.phase,
    scene: getOpenWindowScene(run.step_key, run.scene_variant),
    demonstration: getOpenWindowScene(run.step_key, 0),
    attempt_token: run.attempt_token,
    attempt_index: run.attempt_index,
    decision_index: run.decision_index,
    sound_count: run.sound_count,
    practice_decisions: run.practice_decisions,
    full_runs: run.full_runs,
    game_core_version: run.game_core_version,
    bank_version: run.bank_version,
    attempt_started_at: run.attempt_started_at?.toISOString() ?? null,
    server_now: new Date().toISOString(),
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
  if (run.game_core_version !== GAME_CORE_VERSION || run.bank_version !== OPEN_WINDOW_BANK_VERSION) {
    throw new AppError('open_window_version_changed', 'Restart this lesson', 409);
  }
  return run;
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
          existing.bank_version === OPEN_WINDOW_BANK_VERSION) {
          return { state: toState(existing), restarted_due_to_version: false };
        }
        await client.query(`update open_window_training_run set state = 'abandoned'
          where user_id = $1 and state = 'active'`, [req.user.id]);
        await client.query(`update advanced_training_v2_run set state = 'abandoned'
          where user_id = $1 and state = 'active'`, [req.user.id]);
        const inserted = await client.query<OpenWindowRun>(
          `insert into open_window_training_run
            (id, user_id, step_key, state, phase, scene_variant, attempt_token,
             game_core_version, bank_version)
           values ($1, $2, $3, 'active', 'practice', 1, $4, $5, $6)
           returning *`,
          [randomUUID(), req.user.id, stepKey, randomUUID(), GAME_CORE_VERSION,
            OPEN_WINDOW_BANK_VERSION]);
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
      if (run.game_core_version !== GAME_CORE_VERSION || run.bank_version !== OPEN_WINDOW_BANK_VERSION) {
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
          `update open_window_training_run set attempt_started_at = now()
            where id = $1 returning *`, [run.id]);
        return { state: toState(rows[0]!) };
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
        const scene = getOpenWindowScene(stepKey, run.scene_variant);
        if (data.scene_id !== scene.id) throw new AppError('open_window_scene_mismatch', 'wrong scene', 409);
        const now = Date.now();
        const elapsed = now - run.attempt_started_at.getTime();
        const tap = data.input.type === 'shot' ? data.input.tap_time_ms : scene.endMs;
        const sceneTime = scene.startMs + elapsed;
        if (tap < scene.startMs || tap > scene.endMs ||
          (data.input.type === 'shot' && Math.abs(sceneTime - tap) > 250) ||
          (data.input.type === 'skip' && sceneTime < scene.endMs - 250)) {
          throw new AppError('open_window_invalid_timing', 'decision outside active scene', 409);
        }
        const intervalStart = scene.skipSegment && data.input.type === 'skip'
          ? scene.skipSegment.startMs : scene.startMs;
        const intervalEnd = scene.skipSegment && data.input.type === 'skip'
          ? scene.skipSegment.endMs : scene.endMs;
        const intervals = scanOpenWindows(scene, intervalStart, intervalEnd);
        const evaluation = evaluateOpenWindowDecision(scene,
          data.input.type === 'shot' ? { type: 'shot', tapTimeMs: tap } : { type: 'skip' }, intervals);
        const sound = data.input.type === 'skip'
          ? evaluation.opportunity === 'sensible_skip' :
          stepKey.startsWith('notice_') ? evaluation.relevant : evaluation.onTime;
        const nextPhase = run.phase === 'practice' && sound ? 'check' : run.phase;
        const nextAttempt = run.attempt_index + 1;
        const nextSound = run.phase === 'check' ? run.sound_count + Number(sound) : run.sound_count;
        const finishedCheck = run.phase === 'check' && nextAttempt >= 6;
        const completed = finishedCheck && nextSound >= 4;
        const stageFinish = completed && (['notice_independent', 'anticipate_timing',
          'decide_sequence', 'pace_three_minutes'] as string[]).includes(stepKey);
        let rewardGranted: { stars: number; experience: number } | null = null;
        if (stageFinish) {
          const completion = await client.query(
            `insert into open_window_training_completion
              (user_id, step_key, stage, reward_stars, reward_experience)
             values ($1, $2, $3, 1, 1)
             on conflict (user_id, step_key) do nothing returning step_key`,
            [req.user.id, stepKey, stepKey.split('_')[0]]);
          if (completion.rows[0]) {
            const user = await client.query<{ experience: number }>(
              `update users set xp = xp + 1, experience = experience + 1
                where id = $1 returning experience`, [req.user.id]);
            if (user.rows[0]) await observeCareerExperience(client, req.user.id, {
              eventKey: `open-window:${stepKey}:reward`, occurredAt: new Date(),
              lifetimeTotal: Number(user.rows[0].experience),
            });
            rewardGranted = { stars: 1, experience: 1 };
          }
        }
        if (completed && !stageFinish) await client.query(
          `insert into open_window_training_completion
            (user_id, step_key, stage, reward_stars, reward_experience)
           values ($1, $2, $3, 0, 0) on conflict do nothing`,
          [req.user.id, stepKey, stepKey.split('_')[0]]);
        const { rows } = await client.query<OpenWindowRun>(
          `update open_window_training_run set
             state = $2, phase = $3, scene_variant = $4, attempt_token = $5,
             attempt_index = $6, decision_index = $7, sound_count = $8,
             practice_decisions = practice_decisions + $9, attempt_started_at = null,
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
