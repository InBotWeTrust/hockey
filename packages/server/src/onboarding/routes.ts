import type { FastifyPluginAsync } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import {
  getRequiredOnboarding,
  OnboardingNotRequiredError,
  startOnboardingRun,
} from './service.js';
import type { OnboardingChainKey, OnboardingRequiredDTO } from './types.js';

interface OnboardingRoutesOptions {
  tutorialSeedSecret: string;
  mediaAccessSecret: string;
}

interface OnboardingRunRow {
  id: string;
  user_id: string;
  chain_key: OnboardingChainKey;
  version_id: string;
  completed_at: Date | null;
}

const startBodySchema = z
  .object({
    clientSessionId: z.string().uuid(),
  })
  .strict();

const runParamsSchema = z
  .object({
    runId: z.string().uuid(),
  })
  .strict();

const stepParamsSchema = z
  .object({
    runId: z.string().uuid(),
    stepId: z.string().uuid(),
  })
  .strict();

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

async function lockOwnedRun(
  client: PoolClient,
  runId: string,
  userId: string,
): Promise<OnboardingRunRow> {
  const { rows } = await client.query<OnboardingRunRow>(
    `select run.id, run.user_id, run.chain_key, run.version_id, run.completed_at
       from onboarding_run run
       join onboarding_version version
         on version.id = run.version_id
        and version.chain_key = run.chain_key
      where run.id = $1 and run.user_id = $2
      for update of run`,
    [runId, userId],
  );
  const run = rows[0];
  if (!run) throw new AppError('not_found', 'onboarding run not found', 404);
  return run;
}

async function lockOwnedRunAndUser(
  client: PoolClient,
  runId: string,
  userId: string,
): Promise<OnboardingRunRow> {
  const { rows } = await client.query<OnboardingRunRow>(
    `select run.id, run.user_id, run.chain_key, run.version_id, run.completed_at
       from onboarding_run run
       join onboarding_version version
         on version.id = run.version_id
        and version.chain_key = run.chain_key
       join users on users.id = run.user_id
      where run.id = $1 and run.user_id = $2
      for update of run, users`,
    [runId, userId],
  );
  const run = rows[0];
  if (!run) throw new AppError('not_found', 'onboarding run not found', 404);
  return run;
}

async function requireApplicableChain(
  client: PoolClient,
  run: OnboardingRunRow,
  mediaAccessSecret: string,
): Promise<void> {
  const current = await getRequiredOnboarding(client, run.user_id, mediaAccessSecret);
  if (current.required?.chain !== run.chain_key) {
    throw new AppError('onboarding_not_required', 'onboarding chain is no longer required', 409);
  }
}

async function requireCompletionEvidence(client: PoolClient, run: OnboardingRunRow): Promise<void> {
  const { rows } = await client.query<{
    all_steps_viewed: boolean;
    has_tutorial: boolean;
    has_tutorial_goal: boolean;
  }>(
    `select not exists (
              select 1
                from onboarding_step step
               where step.version_id = $2
                 and not exists (
                   select 1
                     from onboarding_event event
                    where event.run_id = $1
                      and event.user_id = $3
                      and event.chain_key = $4
                      and event.version_id = $2
                      and event.step_id = step.id
                      and event.kind = 'step_viewed'
                 )
            ) as all_steps_viewed,
            exists (
              select 1 from onboarding_step
               where version_id = $2 and kind = 'tutorial_shot'
            ) as has_tutorial,
            exists (
              select 1
                from onboarding_event event
                join onboarding_step step
                  on step.id = event.step_id
                 and step.version_id = $2
                 and step.kind = 'tutorial_shot'
               where event.run_id = $1
                 and event.user_id = $3
                 and event.chain_key = $4
                 and event.version_id = $2
                 and event.kind = 'tutorial_goal'
                 and event.result = 'goal'
            ) as has_tutorial_goal`,
    [run.id, run.version_id, run.user_id, run.chain_key],
  );
  const evidence = rows[0]!;
  if (!evidence.all_steps_viewed) {
    throw new AppError('onboarding_steps_incomplete', 'all onboarding steps must be viewed', 409);
  }
  if (evidence.has_tutorial && !evidence.has_tutorial_goal) {
    throw new AppError('onboarding_tutorial_goal_required', 'tutorial goal is required', 409);
  }
}

async function completeRun(
  client: PoolClient,
  run: OnboardingRunRow,
  mediaAccessSecret: string,
): Promise<OnboardingRequiredDTO> {
  if (run.completed_at !== null) {
    return getRequiredOnboarding(client, run.user_id, mediaAccessSecret);
  }

  await requireApplicableChain(client, run, mediaAccessSecret);
  await requireCompletionEvidence(client, run);
  await client.query(
    `update users
        set beginner_onboarding_completed = case
              when $2 = 'beginner' then true
              else beginner_onboarding_completed
            end,
            amateur_onboarding_completed = case
              when $2 = 'amateur' then true
              else amateur_onboarding_completed
            end
      where id = $1`,
    [run.user_id, run.chain_key],
  );
  await client.query('update onboarding_run set completed_at = now() where id = $1', [run.id]);
  await client.query(
    `insert into onboarding_event
       (run_id, user_id, chain_key, version_id, step_id, kind, result, attempt_number)
     values ($1, $2, $3, $4, null, 'completed', null, 0)
     on conflict (run_id) where kind = 'completed' do nothing`,
    [run.id, run.user_id, run.chain_key, run.version_id],
  );
  return getRequiredOnboarding(client, run.user_id, mediaAccessSecret);
}

export const onboardingRoutes: FastifyPluginAsync<OnboardingRoutesOptions> = async (
  app,
  options,
) => {
  app.get('/onboarding/required', { preHandler: [app.authenticate] }, async (request) =>
    getRequiredOnboarding(app.pg, request.user.id, options.mediaAccessSecret),
  );

  app.post('/onboarding/start', { preHandler: [app.authenticate] }, async (request) => {
    const body = startBodySchema.parse(request.body);
    const current = await getRequiredOnboarding(app.pg, request.user.id, options.mediaAccessSecret);
    if (!current.required) {
      throw new AppError('onboarding_not_required', 'onboarding chain is not required', 409);
    }
    try {
      return await startOnboardingRun(
        app.pg,
        request.user.id,
        current.required.chain,
        body.clientSessionId,
        options.mediaAccessSecret,
      );
    } catch (error) {
      if (error instanceof OnboardingNotRequiredError) {
        throw new AppError('onboarding_not_required', error.message, 409);
      }
      throw error;
    }
  });

  app.post(
    '/onboarding/runs/:runId/steps/:stepId/view',
    { preHandler: [app.authenticate] },
    async (request) => {
      const params = stepParamsSchema.parse(request.params);
      return withTransaction(app, async (client) => {
        const run = await lockOwnedRun(client, params.runId, request.user.id);
        if (run.completed_at !== null) {
          throw new AppError('onboarding_run_completed', 'onboarding run is complete', 409);
        }
        await requireApplicableChain(client, run, options.mediaAccessSecret);
        const step = await client.query<{ id: string }>(
          'select id from onboarding_step where id = $1 and version_id = $2',
          [params.stepId, run.version_id],
        );
        if (!step.rows[0]) {
          throw new AppError('not_found', 'onboarding step not found', 404);
        }
        await client.query(
          `insert into onboarding_event
             (run_id, user_id, chain_key, version_id, step_id, kind, result, attempt_number)
           values ($1, $2, $3, $4, $5, 'step_viewed', null, 0)
           on conflict (run_id, step_id) where kind = 'step_viewed' do nothing`,
          [run.id, run.user_id, run.chain_key, run.version_id, params.stepId],
        );
        return { viewed: true };
      });
    },
  );

  app.post(
    '/onboarding/runs/:runId/complete',
    { preHandler: [app.authenticate] },
    async (request) => {
      const params = runParamsSchema.parse(request.params);
      return withTransaction(app, async (client) => {
        const run = await lockOwnedRunAndUser(client, params.runId, request.user.id);
        return completeRun(client, run, options.mediaAccessSecret);
      });
    },
  );
};
