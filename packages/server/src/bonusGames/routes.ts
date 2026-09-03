import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify';
import type { PoolClient } from 'pg';
import { z, type ZodType } from 'zod';
import { AppError } from '../plugins/errors.js';
import { listBonusGameCards, type BonusGameCardDto } from './catalog.js';
import { purchaseBonusGame } from './economy.js';
import { reconcileBonusAttempt } from './reconcile.js';
import {
  abandonBonusAttempt,
  acknowledgeBonusPreview,
  BonusAttemptAlreadyActiveError,
  loadBonusAttemptDto,
  startBonusPeriod,
  startOrResumeBonusAttempt,
  submitBonusShot,
  type SubmitBonusShotInput,
} from './service.js';
import type { BonusGameAttemptDTO, BonusGameAttemptRow, BonusPeriodRule } from './types.js';

export interface BonusGameRouteOptions {
  bonusSeedSecret: string;
}

const gameParamsSchema = z.object({ gameId: z.string().uuid() }).strict();
const attemptParamsSchema = z.object({ attemptId: z.string().uuid() }).strict();
const unlockBodySchema = z
  .object({ expected_price_stars: z.number().int().min(0).max(10_000_000) })
  .strict();
const previewAcknowledgeBodySchema = z
  .object({ dismiss_future: z.boolean().optional() })
  .strict();
const loadoutSchema = z
  .object({
    stick: z.string().uuid().nullable().optional(),
    skates: z.string().uuid().nullable().optional(),
    nutrition: z.string().uuid().nullable().optional(),
  })
  .strict();
const periodStartBodySchema = z
  .object({ loadout: loadoutSchema.optional() })
  .strict();
const shotBodySchema = z
  .object({
    claimed_shot_index: z.number().int().min(1),
    input: z
      .object({
        tapTime: z.number().finite().nonnegative(),
        shooterTapTime: z.number().finite().nonnegative(),
        puckSpeedPerMs: z.number().optional(),
        shooterFrequency: z.number().optional(),
        goalieFrequency: z.number().optional(),
        goalFrequency: z.number().optional(),
      })
      .strict(),
    claimed_result: z.enum(['goal', 'save', 'miss']),
  })
  .strict();

const SAFE_BONUS_ERRORS: Readonly<
  Record<string, { readonly statusCode: number; readonly message: string }>
> = {
  bonus_level_locked: {
    statusCode: 403,
    message: 'bonus games require amateur access',
  },
  bonus_previous_game_required: {
    statusCode: 409,
    message: 'complete the previous bonus game first',
  },
  bonus_purchase_required: {
    statusCode: 409,
    message: 'unlock this bonus game first',
  },
  bonus_insufficient_stars: {
    statusCode: 409,
    message: 'not enough stars to unlock this bonus game',
  },
  bonus_price_changed: {
    statusCode: 409,
    message: 'bonus game price changed; refresh the catalog',
  },
  bonus_game_inactive: {
    statusCode: 409,
    message: 'this bonus game is not available',
  },
  bonus_attempt_already_active: {
    statusCode: 409,
    message: 'another bonus attempt is already active',
  },
  bonus_attempt_not_active: {
    statusCode: 409,
    message: 'this bonus attempt is not active',
  },
  bonus_period_not_ready: {
    statusCode: 409,
    message: 'this bonus period is not ready',
  },
  bonus_preview_required: {
    statusCode: 409,
    message: 'view the qualification preview before starting',
  },
  bonus_inventory_disabled: {
    statusCode: 409,
    message: 'inventory is disabled for this bonus game',
  },
  bonus_inventory_invalid: {
    statusCode: 409,
    message: 'selected inventory is unavailable',
  },
  bonus_inventory_insufficient: {
    statusCode: 409,
    message: 'not enough inventory charges',
  },
  bonus_shot_index_mismatch: {
    statusCode: 409,
    message: 'bonus shot order is out of date',
  },
  bonus_shot_result_mismatch: {
    statusCode: 409,
    message: 'bonus shot result does not match the server',
  },
  bonus_game_core_version_mismatch: {
    statusCode: 409,
    message: 'this bonus attempt uses an unsupported game version',
  },
  bonus_shot_time_invalid: {
    statusCode: 400,
    message: 'bonus shot timing is invalid',
  },
  bonus_shot_time_stale: {
    statusCode: 409,
    message: 'bonus shot timing is stale',
  },
};

function parseRequest<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError('bad_request', 'invalid bonus game request', 400);
  }
  return parsed.data;
}

function parseShotBody(value: unknown): z.infer<typeof shotBodySchema> {
  const parsed = shotBodySchema.safeParse(value);
  if (!parsed.success) {
    const hasTimeIssue = parsed.error.issues.some(
      (issue) =>
        issue.path[0] === 'input' &&
        (issue.path[1] === 'tapTime' || issue.path[1] === 'shooterTapTime'),
    );
    if (hasTimeIssue) {
      throw new AppError('bonus_shot_time_invalid', 'bonus shot timing is invalid', 400);
    }
    throw new AppError('bad_request', 'invalid bonus game request', 400);
  }
  return parsed.data;
}

function throwSafeBonusError(error: unknown): never {
  if (error instanceof AppError) {
    const safe = SAFE_BONUS_ERRORS[error.code];
    if (safe !== undefined) {
      throw new AppError(error.code, safe.message, safe.statusCode);
    }
    if (error.code === 'bad_request') {
      throw new AppError('bad_request', 'invalid bonus game request', 400);
    }
    if (error.statusCode >= 500) {
      throw new AppError('internal_error', 'internal error', 500);
    }
    throw new AppError(error.code, 'bonus request could not be completed', error.statusCode);
  }
  throw error;
}

async function runBonusRoute<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throwSafeBonusError(error);
  }
}

async function withTransaction<T>(
  app: FastifyInstance,
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

function toPeriodRuleDto(rule: BonusPeriodRule) {
  return {
    period_number: rule.periodNumber,
    duration_ms: rule.durationMs,
    shots_limit: rule.shotsLimit,
    goal_frequency: rule.goalFrequency,
    goalie_frequency: rule.goalieFrequency,
    shooter_frequency: rule.shooterFrequency,
    puck_speed_per_ms: rule.puckSpeedPerMs,
    goalie_pattern: rule.goaliePattern,
    goalie_amplitude: rule.goalieAmplitude,
    goal_amplitude: rule.goalAmplitude,
  };
}

function addMilliseconds(value: string | null, milliseconds: number): string | null {
  if (value === null) return null;
  return new Date(new Date(value).getTime() + milliseconds).toISOString();
}

function toShotInput(
  input: z.infer<typeof shotBodySchema>['input'],
): SubmitBonusShotInput['input'] {
  return {
    tapTime: input.tapTime,
    shooterTapTime: input.shooterTapTime,
    ...(input.puckSpeedPerMs !== undefined ? { puckSpeedPerMs: input.puckSpeedPerMs } : {}),
    ...(input.shooterFrequency !== undefined ? { shooterFrequency: input.shooterFrequency } : {}),
    ...(input.goalieFrequency !== undefined ? { goalieFrequency: input.goalieFrequency } : {}),
    ...(input.goalFrequency !== undefined ? { goalFrequency: input.goalFrequency } : {}),
  };
}

function toAttemptHttpDto(attempt: BonusGameAttemptDTO, now: Date) {
  const activeRule = attempt.rules.periods[attempt.currentPeriod - 1];
  const periodEndsAt =
    attempt.state === 'period_active' && activeRule !== undefined
      ? addMilliseconds(attempt.periodStartedAt, activeRule.durationMs)
      : null;
  const breakEndsAt =
    attempt.state === 'break_active'
      ? addMilliseconds(attempt.breakStartedAt, attempt.rules.breakDurationMs)
      : null;

  return {
    id: attempt.id,
    game_id: attempt.gameId,
    game_slug: attempt.rules.slug,
    game_title: attempt.rules.title,
    skill_code: attempt.rules.skillCode,
    status: attempt.status,
    state: attempt.state,
    current_period: attempt.currentPeriod,
    period_started_at: attempt.periodStartedAt,
    period_ends_at: periodEndsAt,
    break_started_at: attempt.breakStartedAt,
    break_ends_at: breakEndsAt,
    closed_at: attempt.closedAt,
    shots_taken: attempt.shotsTaken,
    current_period_shots_taken: attempt.currentPeriodShotsTaken,
    goals: attempt.goals,
    current_goal_streak: attempt.currentGoalStreak,
    best_goal_streak: attempt.bestGoalStreak,
    preview_required: attempt.previewRequired,
    current_loadout: attempt.currentLoadout,
    reward_granted: attempt.rewardGranted,
    attempt_seed: attempt.attemptSeed,
    game_core_version: attempt.gameCoreVersion,
    definition_revision: attempt.rules.revision,
    server_now: now.toISOString(),
    rules: {
      game_id: attempt.rules.gameId,
      slug: attempt.rules.slug,
      title: attempt.rules.title,
      skill_code: attempt.rules.skillCode,
      revision: attempt.rules.revision,
      target_goals: attempt.rules.targetGoals,
      qualification_rules: attempt.rules.qualificationRules,
      total_periods: attempt.rules.totalPeriods,
      break_duration_ms: attempt.rules.breakDurationMs,
      use_inventory: attempt.rules.useInventory,
      preview_title: attempt.rules.previewTitle,
      preview_story: attempt.rules.previewStory,
      preview_artwork_url: attempt.rules.previewArtworkUrl,
      preview_revision: attempt.rules.previewRevision,
      periods: attempt.rules.periods.map(toPeriodRuleDto),
    },
    reward: attempt.reward,
    arena: {
      id: attempt.rules.arena.id,
      slug: attempt.rules.arena.slug,
      title: attempt.rules.arena.title,
      artwork_url: attempt.rules.arena.artworkUrl,
      thumbnail_url: attempt.rules.arena.thumbnailUrl,
    },
    goalkeeper_ready_url: attempt.rules.goalkeeperReadyUrl,
    goalkeeper_save_url: attempt.rules.goalkeeperSaveUrl,
  };
}

function toCatalogGameHttpDto(game: BonusGameCardDto) {
  return {
    ...game,
    period_rules: game.period_rules.map(toPeriodRuleDto),
  };
}

async function reconcileCurrentAttempt(
  app: FastifyInstance,
  userId: string,
  now: Date,
): Promise<BonusGameAttemptDTO | null> {
  return withTransaction(app, async (client) => {
    const { rows } = await client.query<BonusGameAttemptRow>(
      `select * from bonus_game_attempt
        where user_id = $1 and status = 'active'
        for update`,
      [userId],
    );
    const attempt = rows[0];
    if (attempt === undefined) return null;
    const reconciled = await reconcileBonusAttempt(client, attempt, now);
    return reconciled.status === 'active' ? loadBonusAttemptDto(client, reconciled) : null;
  });
}

async function reconcileOwnedAttempt(
  app: FastifyInstance,
  userId: string,
  attemptId: string,
  now: Date,
): Promise<BonusGameAttemptDTO> {
  return withTransaction(app, async (client) => {
    const { rows } = await client.query<BonusGameAttemptRow>(
      `select * from bonus_game_attempt
        where id = $1 and user_id = $2
        for update`,
      [attemptId, userId],
    );
    const attempt = rows[0];
    if (attempt === undefined) {
      throw new AppError('bonus_attempt_not_active', 'bonus attempt is not active', 409);
    }
    const reconciled =
      attempt.status === 'active' ? await reconcileBonusAttempt(client, attempt, now) : attempt;
    return loadBonusAttemptDto(client, reconciled);
  });
}

function activeAttemptConflict(reply: FastifyReply, error: BonusAttemptAlreadyActiveError) {
  return reply.status(409).send({
    error: {
      code: 'bonus_attempt_already_active',
      message: SAFE_BONUS_ERRORS.bonus_attempt_already_active!.message,
    },
    active_attempt: {
      id: error.activeAttempt.id,
      game_id: error.activeAttempt.gameId,
    },
  });
}

export const bonusGameRoutes: FastifyPluginAsync<BonusGameRouteOptions> = async (app, opts) => {
  app.get('/bonus-games', { preHandler: [app.authenticate] }, async (request) =>
    runBonusRoute(async () => {
      const now = new Date();
      await reconcileCurrentAttempt(app, request.user.id, now);
      const games = await listBonusGameCards(app.pg, request.user.id);
      return {
        games: games.map(toCatalogGameHttpDto),
        active_attempt: games.find((game) => game.active_attempt !== null)?.active_attempt ?? null,
      };
    }),
  );

  app.get('/bonus-games/attempts/current', { preHandler: [app.authenticate] }, async (request) =>
    runBonusRoute(async () => {
      const now = new Date();
      const attempt = await reconcileCurrentAttempt(app, request.user.id, now);
      return { attempt: attempt === null ? null : toAttemptHttpDto(attempt, now) };
    }),
  );

  app.post('/bonus-games/:gameId/unlock', { preHandler: [app.authenticate] }, async (request) =>
    runBonusRoute(async () => {
      const params = parseRequest(gameParamsSchema, request.params);
      const body = parseRequest(unlockBodySchema, request.body);
      const result = await purchaseBonusGame(app.pg, {
        userId: request.user.id,
        gameId: params.gameId,
        expectedPriceStars: body.expected_price_stars,
        now: new Date(),
      });
      return { unlocked: result.unlocked, star_balance: result.starBalance };
    }),
  );

  app.post(
    '/bonus-games/:gameId/attempts',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        const params = parseRequest(gameParamsSchema, request.params);
        const now = new Date();
        const result = await startOrResumeBonusAttempt(app.pg, {
          userId: request.user.id,
          gameId: params.gameId,
          now,
          seedSecret: opts.bonusSeedSecret,
        });
        return reply
          .status(result.created ? 201 : 200)
          .send({ attempt: toAttemptHttpDto(result.attempt, now) });
      } catch (error) {
        if (error instanceof BonusAttemptAlreadyActiveError) {
          return activeAttemptConflict(reply, error);
        }
        throwSafeBonusError(error);
      }
    },
  );

  app.get('/bonus-games/attempts/:attemptId', { preHandler: [app.authenticate] }, async (request) =>
    runBonusRoute(async () => {
      const params = parseRequest(attemptParamsSchema, request.params);
      const now = new Date();
      const attempt = await reconcileOwnedAttempt(app, request.user.id, params.attemptId, now);
      return { attempt: toAttemptHttpDto(attempt, now) };
    }),
  );

  app.post(
    '/bonus-games/attempts/:attemptId/preview/acknowledge',
    { preHandler: [app.authenticate] },
    async (request) =>
      runBonusRoute(async () => {
        const params = parseRequest(attemptParamsSchema, request.params);
        const body = parseRequest(previewAcknowledgeBodySchema, request.body ?? {});
        const now = new Date();
        const attempt = await acknowledgeBonusPreview(app.pg, {
          userId: request.user.id,
          attemptId: params.attemptId,
          dismissFuture: body.dismiss_future ?? false,
          now,
        });
        return { attempt: toAttemptHttpDto(attempt, now) };
      }),
  );

  app.post(
    '/bonus-games/attempts/:attemptId/period/start',
    { preHandler: [app.authenticate] },
    async (request) =>
      runBonusRoute(async () => {
        const params = parseRequest(attemptParamsSchema, request.params);
        const body = parseRequest(periodStartBodySchema, request.body ?? {});
        const now = new Date();
        const attempt = await startBonusPeriod(app.pg, {
          userId: request.user.id,
          attemptId: params.attemptId,
          now,
          ...(body.loadout !== undefined
            ? {
                loadout: {
                  ...(body.loadout.stick !== undefined ? { stick: body.loadout.stick } : {}),
                  ...(body.loadout.skates !== undefined ? { skates: body.loadout.skates } : {}),
                  ...(body.loadout.nutrition !== undefined
                    ? { nutrition: body.loadout.nutrition }
                    : {}),
                },
              }
            : {}),
        });
        return { attempt: toAttemptHttpDto(attempt, now) };
      }),
  );

  app.post(
    '/bonus-games/attempts/:attemptId/shot',
    { preHandler: [app.authenticate] },
    async (request) =>
      runBonusRoute(async () => {
        const params = parseRequest(attemptParamsSchema, request.params);
        const body = parseShotBody(request.body);
        const now = new Date();
        const result = await submitBonusShot(app.pg, {
          userId: request.user.id,
          attemptId: params.attemptId,
          claimedShotIndex: body.claimed_shot_index,
          input: toShotInput(body.input),
          claimedResult: body.claimed_result,
          now,
        });
        return {
          server_result: result.serverResult,
          attempt: toAttemptHttpDto(result.attempt, now),
          reward_granted: result.attempt.rewardGranted,
          balances: result.balances,
        };
      }),
  );

  app.post(
    '/bonus-games/attempts/:attemptId/abandon',
    { preHandler: [app.authenticate] },
    async (request) =>
      runBonusRoute(async () => {
        const params = parseRequest(attemptParamsSchema, request.params);
        const now = new Date();
        const attempt = await abandonBonusAttempt(app.pg, {
          userId: request.user.id,
          attemptId: params.attemptId,
          now,
        });
        return { attempt: toAttemptHttpDto(attempt, now) };
      }),
  );
};
