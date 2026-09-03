import { createHmac } from 'node:crypto';
import {
  GAME_CORE_VERSION,
  STICK_NEUTRAL,
  deriveShotSeed,
  getGoalie,
  getSessionPhaseOffsets,
  resolveShot,
  type ShotResult,
} from '@hockey/game-core';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { getGameSettings } from '../duel/gameSettings.js';
import { AppError } from '../plugins/errors.js';
import { resolveCompetitionLevel } from '../profile/summary.js';
import { createMediaProxyUrl } from '../storage/mediaAccess.js';
import {
  onboardingTutorialConfigSchema,
  type OnboardingChainKey,
  type OnboardingRequiredDTO,
  type OnboardingStepDTO,
} from './types.js';

type Queryable = Pool | PoolClient;
type RequiredOnboarding = NonNullable<OnboardingRequiredDTO['required']>;

interface ApplicabilityRow {
  beginner_onboarding_completed: boolean;
  amateur_onboarding_completed: boolean;
  level: number | string;
  lifetime_goals_total: number | string;
  beginner_enforcement_enabled: boolean;
  beginner_version_id: string | null;
  amateur_enforcement_enabled: boolean;
  amateur_version_id: string | null;
  beginner_onboarding_reset_at: Date | null;
  amateur_onboarding_reset_at: Date | null;
  beginner_natural_completed_at: Date | null;
  amateur_natural_completed_at: Date | null;
}

interface PublishedStepRow {
  version_id: string;
  step_id: string | null;
  position: number | null;
  kind: 'informational' | 'tutorial_shot' | null;
  title: string | null;
  description: string | null;
  cta_label: string | null;
  media_object_id: string | null;
  tutorial_config: unknown;
}

interface RequiredOnboardingDetails {
  required: RequiredOnboarding | null;
  row: ApplicabilityRow | undefined;
}

const tutorialRunStateSchema = z
  .object({
    seed: z.string().regex(/^[0-9a-f]{64}$/),
    gameCoreVersion: z.number().int().positive(),
    nextShotIndex: z.number().int().positive(),
    stepId: z.string().uuid(),
    speeds: onboardingTutorialConfigSchema,
  })
  .strict();

export type TutorialRunState = z.infer<typeof tutorialRunStateSchema>;

export interface TutorialRunIdentity {
  id: string;
  userId: string;
  chainKey: OnboardingChainKey;
  versionId: string;
  tutorialState: unknown;
}

interface TutorialSessionDTO {
  seed: string;
  shotIndex: number;
  goalieId: 'rookie';
  gameCoreVersion: number;
  speeds: TutorialRunState['speeds'];
  goalConfirmed: boolean;
}

interface TutorialShotInput {
  shotIndex: number;
  input: {
    tapTime: number;
    shooterTapTime: number;
  };
  claimedResult: ShotResult['type'];
}

interface TutorialShotDTO {
  serverResult: ShotResult['type'];
  nextShotIndex: number;
  goalConfirmed: boolean;
}

export class OnboardingNotRequiredError extends Error {
  constructor() {
    super('onboarding chain is not required');
  }
}

function numberValue(value: number | string): number {
  return typeof value === 'number' ? value : Number(value);
}

function deriveTutorialSeed(run: TutorialRunIdentity, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${run.userId}:${run.id}:${run.versionId}`)
    .digest('hex');
}

async function hasTutorialGoal(db: Queryable, runId: string): Promise<boolean> {
  const { rows } = await db.query<{ goal_confirmed: boolean }>(
    `select exists (
       select 1 from onboarding_event
        where run_id = $1 and kind = 'tutorial_goal' and result = 'goal'
     ) as goal_confirmed`,
    [runId],
  );
  return rows[0]!.goal_confirmed;
}

function tutorialSessionDto(state: TutorialRunState, goalConfirmed: boolean): TutorialSessionDTO {
  return {
    seed: state.seed,
    shotIndex: state.nextShotIndex,
    goalieId: 'rookie',
    gameCoreVersion: state.gameCoreVersion,
    speeds: state.speeds,
    goalConfirmed,
  };
}

export async function startTutorialSession(
  db: PoolClient,
  run: TutorialRunIdentity,
  secret: string,
): Promise<TutorialSessionDTO> {
  if (run.tutorialState !== null) {
    const state = tutorialRunStateSchema.parse(run.tutorialState);
    return tutorialSessionDto(state, await hasTutorialGoal(db, run.id));
  }

  const { rows } = await db.query<{ id: string; tutorial_config: unknown }>(
    `select id, tutorial_config
       from onboarding_step
      where version_id = $1 and kind = 'tutorial_shot'
      order by position
      limit 1`,
    [run.versionId],
  );
  const tutorialStep = rows[0];
  if (!tutorialStep) {
    throw new AppError(
      'onboarding_tutorial_unavailable',
      'onboarding version has no tutorial step',
      409,
    );
  }

  const state: TutorialRunState = {
    seed: deriveTutorialSeed(run, secret),
    gameCoreVersion: GAME_CORE_VERSION,
    nextShotIndex: 1,
    stepId: tutorialStep.id,
    speeds: onboardingTutorialConfigSchema.parse(tutorialStep.tutorial_config),
  };
  await db.query('update onboarding_run set tutorial_state = $2::jsonb where id = $1', [
    run.id,
    JSON.stringify(state),
  ]);
  return tutorialSessionDto(state, false);
}

export async function submitTutorialShot(
  db: PoolClient,
  run: TutorialRunIdentity,
  input: TutorialShotInput,
): Promise<TutorialShotDTO> {
  if (run.tutorialState === null) {
    throw new AppError(
      'onboarding_tutorial_not_started',
      'onboarding tutorial has not started',
      409,
    );
  }
  const state = tutorialRunStateSchema.parse(run.tutorialState);
  if (state.gameCoreVersion !== GAME_CORE_VERSION) {
    throw new AppError(
      'onboarding_game_core_version_mismatch',
      'onboarding tutorial game core version is no longer available',
      409,
    );
  }
  if (input.shotIndex !== state.nextShotIndex) {
    throw new AppError(
      'onboarding_tutorial_shot_index_mismatch',
      `onboarding tutorial shot index mismatch: expected ${state.nextShotIndex}`,
      409,
    );
  }

  const shotInput = {
    tapTime: input.input.tapTime,
    shooterTapTime: input.input.shooterTapTime,
    shooterFrequency: state.speeds.shooterFrequency,
    goalieFrequency: state.speeds.goalieFrequency,
    goalFrequency: state.speeds.goalFrequency,
  };
  const serverResult = resolveShot(
    shotInput,
    getGoalie('rookie'),
    deriveShotSeed(state.seed, 1, state.nextShotIndex),
    state.nextShotIndex,
    STICK_NEUTRAL,
    getSessionPhaseOffsets(state.seed),
  ).type;
  await db.query(
    `insert into onboarding_event
       (run_id, user_id, chain_key, version_id, step_id, kind, result, attempt_number)
     values ($1, $2, $3, $4, $5, 'tutorial_attempt', $6, $7)`,
    [
      run.id,
      run.userId,
      run.chainKey,
      run.versionId,
      state.stepId,
      serverResult,
      state.nextShotIndex,
    ],
  );
  if (serverResult === 'goal') {
    await db.query(
      `insert into onboarding_event
         (run_id, user_id, chain_key, version_id, step_id, kind, result, attempt_number)
       values ($1, $2, $3, $4, $5, 'tutorial_goal', 'goal', $6)
       on conflict (run_id) where kind = 'tutorial_goal' do nothing`,
      [run.id, run.userId, run.chainKey, run.versionId, state.stepId, state.nextShotIndex],
    );
  }

  const nextState = { ...state, nextShotIndex: state.nextShotIndex + 1 };
  await db.query('update onboarding_run set tutorial_state = $2::jsonb where id = $1', [
    run.id,
    JSON.stringify(nextState),
  ]);
  return {
    serverResult,
    nextShotIndex: nextState.nextShotIndex,
    goalConfirmed: serverResult === 'goal' || (await hasTutorialGoal(db, run.id)),
  };
}

function requiredChain(
  row: ApplicabilityRow,
  amateurUnlockGoalsRequired: number,
): OnboardingChainKey | null {
  const competitionLevel = resolveCompetitionLevel(
    numberValue(row.level),
    numberValue(row.lifetime_goals_total),
    amateurUnlockGoalsRequired,
  );
  if (
    !row.beginner_onboarding_completed &&
    row.beginner_enforcement_enabled &&
    row.beginner_version_id !== null
  ) {
    return 'beginner';
  }
  if (
    !row.amateur_onboarding_completed &&
    competitionLevel !== 'beginner' &&
    row.amateur_enforcement_enabled &&
    row.amateur_version_id !== null
  ) {
    return 'amateur';
  }
  return null;
}

async function loadApplicabilityRow(
  db: Queryable,
  userId: string,
): Promise<ApplicabilityRow | undefined> {
  const { rows } = await db.query<ApplicabilityRow>(
    `select u.beginner_onboarding_completed,
            u.amateur_onboarding_completed,
            u.level,
            u.lifetime_goals_total,
            beginner.enforcement_enabled as beginner_enforcement_enabled,
            beginner_version.id as beginner_version_id,
            amateur.enforcement_enabled as amateur_enforcement_enabled,
            amateur_version.id as amateur_version_id,
            u.beginner_onboarding_reset_at,
            u.amateur_onboarding_reset_at,
            natural_completion.beginner_natural_completed_at,
            natural_completion.amateur_natural_completed_at
       from users u
       left join onboarding_chain beginner on beginner.key = 'beginner'
       left join onboarding_version beginner_version
         on beginner_version.id = beginner.current_published_version_id
        and beginner_version.status = 'published'
       left join onboarding_chain amateur on amateur.key = 'amateur'
       left join onboarding_version amateur_version
         on amateur_version.id = amateur.current_published_version_id
        and amateur_version.status = 'published'
       left join lateral (
         select max(completed_at) filter (
                  where chain_key = 'beginner' and source = 'natural'
                ) as beginner_natural_completed_at,
                max(completed_at) filter (
                  where chain_key = 'amateur' and source = 'natural'
                ) as amateur_natural_completed_at
           from onboarding_run
          where user_id = u.id
       ) natural_completion on true
      where u.id = $1`,
    [userId],
  );
  return rows[0];
}

function mapPublishedStep(row: PublishedStepRow, mediaAccessSecret: string): OnboardingStepDTO {
  if (
    row.step_id === null ||
    row.position === null ||
    row.kind === null ||
    row.title === null ||
    row.description === null ||
    row.cta_label === null
  ) {
    throw new Error('published onboarding version contains an incomplete step');
  }
  if (row.kind === 'informational') {
    if (row.media_object_id === null) {
      throw new Error('published informational onboarding step has no media');
    }
    return {
      id: row.step_id,
      position: row.position,
      kind: 'informational',
      title: row.title,
      description: row.description,
      ctaLabel: row.cta_label,
      imageUrl: createMediaProxyUrl(mediaAccessSecret, row.media_object_id),
    };
  }
  return {
    id: row.step_id,
    position: row.position,
    kind: 'tutorial_shot',
    title: row.title,
    description: row.description,
    ctaLabel: row.cta_label,
    tutorial: onboardingTutorialConfigSchema.parse(row.tutorial_config),
  };
}

export async function loadPublishedVersion(
  db: Queryable,
  chainKey: OnboardingChainKey,
  mediaAccessSecret: string,
): Promise<RequiredOnboarding | null> {
  const { rows } = await db.query<PublishedStepRow>(
    `select version.id as version_id,
            step.id as step_id,
            step.position,
            step.kind,
            step.title,
            step.description,
            step.cta_label,
            step.media_object_id,
            step.tutorial_config
       from onboarding_chain chain
       join onboarding_version version
         on version.id = chain.current_published_version_id
        and version.status = 'published'
       left join onboarding_step step on step.version_id = version.id
      where chain.key = $1
      order by step.position asc nulls last`,
    [chainKey],
  );
  const first = rows[0];
  if (!first) return null;
  return {
    chain: chainKey,
    versionId: first.version_id,
    steps: rows.map((row) => mapPublishedStep(row, mediaAccessSecret)),
  };
}

async function getRequiredOnboardingDetails(
  db: Queryable,
  userId: string,
  mediaAccessSecret: string,
): Promise<RequiredOnboardingDetails> {
  const row = await loadApplicabilityRow(db, userId);
  if (!row) return { required: null, row: undefined };
  const settings = await getGameSettings(db);
  const chainKey = requiredChain(row, settings.amateur.unlockGoalsRequired);
  if (!chainKey) return { required: null, row };
  return { required: await loadPublishedVersion(db, chainKey, mediaAccessSecret), row };
}

export async function getRequiredOnboarding(
  db: Queryable,
  userId: string,
  mediaAccessSecret: string,
): Promise<OnboardingRequiredDTO> {
  const { required } = await getRequiredOnboardingDetails(db, userId, mediaAccessSecret);
  return { required };
}

function runSource(row: ApplicabilityRow, chainKey: OnboardingChainKey): 'natural' | 'admin_reset' {
  const resetAt =
    chainKey === 'beginner' ? row.beginner_onboarding_reset_at : row.amateur_onboarding_reset_at;
  const naturalCompletedAt =
    chainKey === 'beginner' ? row.beginner_natural_completed_at : row.amateur_natural_completed_at;
  return resetAt !== null && (naturalCompletedAt === null || resetAt > naturalCompletedAt)
    ? 'admin_reset'
    : 'natural';
}

export async function startOnboardingRun(
  db: Pool,
  userId: string,
  chainKey: OnboardingChainKey,
  clientSessionId: string,
  mediaAccessSecret: string,
): Promise<{ runId: string; required: RequiredOnboarding }> {
  const client = await db.connect();
  try {
    await client.query('begin');
    await client.query('select id from users where id = $1 for update', [userId]);
    const details = await getRequiredOnboardingDetails(client, userId, mediaAccessSecret);
    if (!details.required || details.required.chain !== chainKey || !details.row) {
      throw new OnboardingNotRequiredError();
    }
    const source = runSource(details.row, chainKey);
    const inserted = await client.query<{ id: string }>(
      `insert into onboarding_run
         (user_id, chain_key, version_id, client_session_id, source)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id, chain_key, version_id, client_session_id) do nothing
       returning id`,
      [userId, chainKey, details.required.versionId, clientSessionId, source],
    );
    const existing =
      inserted.rows[0] ??
      (
        await client.query<{ id: string }>(
          `select id from onboarding_run
            where user_id = $1
              and chain_key = $2
              and version_id = $3
              and client_session_id = $4`,
          [userId, chainKey, details.required.versionId, clientSessionId],
        )
      ).rows[0];
    if (!existing) throw new Error('onboarding run insert did not return a run');
    await client.query('commit');
    return { runId: existing.id, required: details.required };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
