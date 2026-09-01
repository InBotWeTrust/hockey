import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import sharp, { type Metadata } from 'sharp';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { createTournamentDuelMatch } from '../duel/amateur/routes.js';
import { parseTournamentConfig } from './config.js';
import { normalizePublishedTournamentLifecycleRules } from './lifecycleRules.js';
import {
  applyToTournament,
  approveAllTournamentApplications,
  approveTournamentParticipant,
  archiveTournament,
  cancelTournament,
  countPendingTournamentApplications,
  createTournamentDraft,
  disqualifyTournamentParticipant,
  duplicateTournamentDraft,
  deleteEmptyDraft,
  getTournament,
  getTournamentMatchdays,
  getTournamentSchedule,
  getTournamentStandings,
  getTournamentBracket,
  generateRegularSchedule,
  isTournamentFeatureEnabled,
  inviteTournamentParticipant,
  listAdminTournaments,
  listTournamentParticipants,
  listPlayerTournamentParticipants,
  listPlayerTournaments,
  pauseTournament,
  publishTournament,
  publishRegularSchedule,
  rejectTournamentApplication,
  resumeTournament,
  startTournamentPlayoffs,
  rescheduleTournamentFixture,
  resolveTournamentNoShow,
  updateTournamentDraft,
  updateTournamentRewards,
  withdrawTournamentApplication,
  type TournamentRulesSnapshot,
} from './service.js';
import { openTournamentFixtureSegment } from './fixtureLifecycle.js';
import { chooseTournamentNextGame, getTournamentFixtureAttemptState } from './fixtureAttempts.js';
import { publishTournamentFixtureProgress } from './realtimeProgress.js';
import {
  finalizeTournamentDailyDay,
  refreshCompletedTournamentDailyResultsForTournament,
} from './dailyAggregate.js';
import { grantTournamentStageRewards } from './rewards.js';
import { getFixtureLiveState, proposeFixtureLiveTime, respondFixtureLiveProposal } from './live.js';
import { enqueueTournamentAudiencePush } from '../push/tournament.js';
import {
  dispatchTournamentCommunication,
  listTournamentDispatches,
  previewTournamentAudience,
} from './communications.js';
import { createMediaProxyUrl } from '../storage/mediaAccess.js';
import { invalidateUnreadCache } from '../chat/cache.js';
import {
  createMediaObjectKey,
  type ObjectStorageClient,
  type ObjectStorageUploadResult,
} from '../storage/objectStorage.js';
import {
  getClassicGameState,
  listActiveClassicGames,
  startClassicGamePeriod,
  submitClassicGameShot,
} from './classicGame.js';
import {
  confirmTournamentSeriesWinnerDecision,
  requestTournamentSeriesWinnerDecision,
} from './seriesAdminDecisions.js';

const uuid = z.string().uuid();
const nullableDate = z.string().datetime({ offset: true }).nullable().default(null);
const nullableImageUrl = z.string().trim().max(2048).nullable().optional();
const TOURNAMENT_ARTWORK_MAX_PIXELS = 2048 * 2048;
const classicShotSchema = z.object({
  shot_index: z.number().int().min(1),
  input: z.object({
    tapTime: z.number().finite().min(0),
    shooterTapTime: z.number().finite().optional(),
    puckSpeedPerMs: z.number().finite().optional(),
    shooterFrequency: z.number().finite().optional(),
    goalieFrequency: z.number().finite().optional(),
    goalFrequency: z.number().finite().optional(),
  }),
  claimed_result: z.enum(['goal', 'save', 'miss']),
});

const eligibilitySchema = z
  .object({
    minLevel: z.number().int().min(1).nullable().default(null),
    maxLevel: z.number().int().min(1).nullable().default(null),
    minGoals: z.number().int().min(0).default(0),
    minExperience: z.number().int().min(0).default(0),
    invitedUserIds: z.array(uuid).max(10_000).default([]),
    bannedUserIds: z.array(uuid).max(10_000).default([]),
  })
  .refine(
    (rules) =>
      rules.minLevel === null || rules.maxLevel === null || rules.minLevel <= rules.maxLevel,
    { message: 'minimum level cannot exceed maximum level' },
  );

const rulesSchema = z
  .object({
    config: z.unknown(),
    eligibility: eligibilitySchema.default({
      minLevel: null,
      maxLevel: null,
      minGoals: 0,
      minExperience: 0,
      invitedUserIds: [],
      bannedUserIds: [],
    }),
  })
  .passthrough();

const draftSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(10_000).default(''),
  imageUrl: nullableImageUrl,
  rules: rulesSchema,
  registrationOpensAt: nullableDate,
  registrationClosesAt: nullableDate,
  startsAt: nullableDate,
});

const updateSchema = draftSchema.omit({ slug: true }).extend({
  expectedRevision: z.number().int().min(1),
});

const stageRewardsSchema = z
  .array(
    z.object({
      place: z.number().int().min(1),
      experience: z.number().int().min(0),
      coins: z.number().int().min(0),
      stars: z.number().int().min(0),
    }),
  )
  .max(64)
  .refine((rows) => new Set(rows.map((row) => row.place)).size === rows.length, {
    message: 'reward places must be unique',
  });

export function parseRules(
  input: z.infer<typeof rulesSchema>,
  options: { markNewAutomaticLifecycle?: boolean } = {},
): TournamentRulesSnapshot {
  try {
    return normalizePublishedTournamentLifecycleRules(
      {
        ...input,
        config: parseTournamentConfig(input.config),
        eligibility: input.eligibility,
      },
      options.markNewAutomaticLifecycle === true ? { markNewAutomaticLifecycle: true } : {},
    ) as TournamentRulesSnapshot;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error) throw new AppError('bad_request', error.message, 400);
    throw error;
  }
}

async function requireAdmin(app: Parameters<FastifyPluginAsync>[0], req: FastifyRequest) {
  const { rows } = await app.pg.query<{ role: string }>('select role from users where id = $1', [
    req.user.id,
  ]);
  if (rows[0]?.role !== 'admin') throw new AppError('forbidden', 'admin role required', 403);
}

async function requireTournamentFeature(app: Parameters<FastifyPluginAsync>[0]) {
  if (!(await isTournamentFeatureEnabled(app.pg))) {
    throw new AppError('not_found', 'tournaments are not available', 404);
  }
}

interface TournamentRoutesOptions {
  systemUserId?: string;
  objectStorage?: ObjectStorageClient;
  mediaAccessSecret: string;
  tournamentGameSeedSecret: string;
  duelSeedSecret: string;
}

export const tournamentRoutes: FastifyPluginAsync<TournamentRoutesOptions> = async (
  app,
  options,
) => {
  app.addContentTypeParser(
    'image/webp',
    {
      parseAs: 'buffer',
      bodyLimit: options.objectStorage?.maxUploadBytes ?? 5 * 1024 * 1024,
    },
    (_request, body, done) => done(null, body),
  );
  const authenticated = { preHandler: [app.authenticate] };
  const admin = {
    preHandler: [app.authenticate, async (req: FastifyRequest) => requireAdmin(app, req)],
  };

  app.get('/tournaments', authenticated, async (req) => {
    await requireTournamentFeature(app);
    return { tournaments: await listPlayerTournaments(app.pg, req.user.id) };
  });

  app.get('/tournaments/classic/active', authenticated, async (req) => {
    await requireTournamentFeature(app);
    return {
      games: await listActiveClassicGames(app.pg, { userId: req.user.id, now: new Date() }),
    };
  });

  app.get('/tournaments/:tournamentId/classic/state', authenticated, async (req) => {
    await requireTournamentFeature(app);
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    return getClassicGameState(app.pg, {
      userId: req.user.id,
      tournamentId: params.tournamentId,
      now: new Date(),
      seedSecret: options.tournamentGameSeedSecret,
    });
  });

  app.post('/tournaments/:tournamentId/classic/period/start', authenticated, async (req) => {
    await requireTournamentFeature(app);
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    return startClassicGamePeriod(app.pg, {
      userId: req.user.id,
      tournamentId: params.tournamentId,
      now: new Date(),
      seedSecret: options.tournamentGameSeedSecret,
    });
  });

  app.post('/tournaments/:tournamentId/classic/shot', authenticated, async (req) => {
    await requireTournamentFeature(app);
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    const body = classicShotSchema.parse(req.body);
    return submitClassicGameShot(app.pg, {
      userId: req.user.id,
      tournamentId: params.tournamentId,
      now: new Date(),
      seedSecret: options.tournamentGameSeedSecret,
      shotIndex: body.shot_index,
      input: {
        tapTime: body.input.tapTime,
        ...(body.input.shooterTapTime === undefined
          ? {}
          : { shooterTapTime: body.input.shooterTapTime }),
        ...(body.input.puckSpeedPerMs === undefined
          ? {}
          : { puckSpeedPerMs: body.input.puckSpeedPerMs }),
        ...(body.input.shooterFrequency === undefined
          ? {}
          : { shooterFrequency: body.input.shooterFrequency }),
        ...(body.input.goalieFrequency === undefined
          ? {}
          : { goalieFrequency: body.input.goalieFrequency }),
        ...(body.input.goalFrequency === undefined
          ? {}
          : { goalFrequency: body.input.goalFrequency }),
      },
      claimedResult: body.claimed_result,
    });
  });

  app.get('/tournaments/:tournamentId', authenticated, async (req) => {
    await requireTournamentFeature(app);
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    return { tournament: await getTournament(app.pg, params.tournamentId, req.user.id) };
  });

  app.get('/tournaments/:tournamentId/participants', authenticated, async (req) => {
    await requireTournamentFeature(app);
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    await getTournament(app.pg, params.tournamentId, req.user.id);
    return {
      participants: await listPlayerTournamentParticipants(app.pg, params.tournamentId),
    };
  });

  app.get('/tournaments/:tournamentId/schedule', authenticated, async (req) => {
    await requireTournamentFeature(app);
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    await getTournament(app.pg, params.tournamentId, req.user.id);
    const [fixtures, matchdays] = await Promise.all([
      getTournamentSchedule(app.pg, params.tournamentId),
      getTournamentMatchdays(app.pg, params.tournamentId, req.user.id),
    ]);
    return { fixtures, matchdays };
  });

  app.get('/tournaments/:tournamentId/standings', authenticated, async (req) => {
    await requireTournamentFeature(app);
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    await getTournament(app.pg, params.tournamentId, req.user.id);
    await refreshCompletedTournamentDailyResultsForTournament(app.pg, {
      tournamentId: params.tournamentId,
      now: new Date(),
    });
    return { standings: await getTournamentStandings(app.pg, params.tournamentId) };
  });

  app.get('/tournaments/:tournamentId/bracket', authenticated, async (req) => {
    await requireTournamentFeature(app);
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    await getTournament(app.pg, params.tournamentId, req.user.id);
    return { series: await getTournamentBracket(app.pg, params.tournamentId) };
  });

  app.post(
    '/tournaments/:tournamentId/fixtures/:fixtureId/segments/open',
    authenticated,
    async (req) => {
      await requireTournamentFeature(app);
      const params = z.object({ tournamentId: uuid, fixtureId: uuid }).parse(req.params);
      const opened = await openTournamentFixtureSegment(
        app.pg,
        { ...params, userId: req.user.id, now: new Date() },
        (client, input) => createTournamentDuelMatch(client, input, options.duelSeedSecret),
      );
      await publishTournamentFixtureProgress(app.pg, app.realtime, app.log, {
        duelMatchId: opened.duelMatchId,
        sequence: Date.now(),
      });
      return opened;
    },
  );

  app.get('/tournaments/:tournamentId/fixtures/:fixtureId/attempt', authenticated, async (req) => {
    await requireTournamentFeature(app);
    const params = z.object({ tournamentId: uuid, fixtureId: uuid }).parse(req.params);
    return getTournamentFixtureAttemptState(app.pg, {
      ...params,
      userId: req.user.id,
      now: new Date(),
    });
  });

  app.post(
    '/tournaments/:tournamentId/fixtures/:fixtureId/attempt/next-game-choice',
    authenticated,
    async (req) => {
      await requireTournamentFeature(app);
      const params = z.object({ tournamentId: uuid, fixtureId: uuid }).parse(req.params);
      const body = z.object({ choice: z.enum(['immediate', 'scheduled']) }).parse(req.body);
      return chooseTournamentNextGame(app.pg, {
        ...params,
        ...body,
        userId: req.user.id,
        now: new Date(),
      });
    },
  );

  app.get('/admin/tournaments/:tournamentId/dispatches', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    return { dispatches: await listTournamentDispatches(app.pg, params.tournamentId) };
  });

  app.get('/admin/tournaments/:tournamentId/audience-preview', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    const query = z
      .object({
        audience: z.enum(['approved', 'all_participants', 'all_players']).default('approved'),
      })
      .parse(req.query);
    return previewTournamentAudience(app.pg, params.tournamentId, query.audience);
  });

  app.post('/admin/tournaments/:tournamentId/dispatches', admin, async (req, reply) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    const body = z
      .object({
        idempotencyKey: z.string().trim().min(8).max(200),
        kind: z.enum(['push', 'direct_message', 'official_news']),
        audience: z.enum(['approved', 'all_participants', 'all_players']),
        title: z.string().trim().min(1).max(120),
        body: z.string().trim().min(1).max(4000),
        includeTournamentButton: z.boolean().default(false),
      })
      .parse(req.body);
    const result = await dispatchTournamentCommunication(app.pg, app.realtime, {
      tournamentId: params.tournamentId,
      ...body,
      createdBy: req.user.id,
      ...(options.systemUserId !== undefined ? { systemUserId: options.systemUserId } : {}),
      invalidateUnreadCache: (userId) => invalidateUnreadCache(app.redis, userId),
    });
    reply.status(202);
    return result;
  });

  app.get('/tournaments/fixtures/:fixtureId/live', authenticated, async (req) => {
    await requireTournamentFeature(app);
    const params = z.object({ fixtureId: uuid }).parse(req.params);
    return { live: await getFixtureLiveState(app.pg, params.fixtureId, req.user.id) };
  });

  app.post('/tournaments/fixtures/:fixtureId/live/proposals', authenticated, async (req) => {
    await requireTournamentFeature(app);
    const params = z.object({ fixtureId: uuid }).parse(req.params);
    const body = z.object({ proposedAt: z.string().datetime({ offset: true }) }).parse(req.body);
    const proposal = await proposeFixtureLiveTime(app.pg, {
      fixtureId: params.fixtureId,
      userId: req.user.id,
      proposedAt: new Date(body.proposedAt),
    });
    await app.realtime.publish(`tournament:fixture:${params.fixtureId}`, {
      type: 'tournament:fixture_update',
      fixtureId: params.fixtureId,
      sequence: Date.now(),
      payload: { proposal },
    });
    return proposal;
  });

  app.post(
    '/tournaments/fixtures/:fixtureId/live/proposals/:proposalId/respond',
    authenticated,
    async (req) => {
      await requireTournamentFeature(app);
      const params = z.object({ fixtureId: uuid, proposalId: uuid }).parse(req.params);
      const body = z.object({ accept: z.boolean() }).parse(req.body);
      const response = await respondFixtureLiveProposal(app.pg, {
        ...params,
        userId: req.user.id,
        accept: body.accept,
      });
      await app.realtime.publish(`tournament:fixture:${params.fixtureId}`, {
        type: 'tournament:fixture_update',
        fixtureId: params.fixtureId,
        sequence: Date.now(),
        payload: { proposal: response },
      });
      return response;
    },
  );

  app.post('/tournaments/:tournamentId/applications', authenticated, async (req) => {
    await requireTournamentFeature(app);
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    return applyToTournament(app.pg, params.tournamentId, req.user.id);
  });

  app.delete('/tournaments/:tournamentId/applications/me', authenticated, async (req) => {
    await requireTournamentFeature(app);
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    return withdrawTournamentApplication(app.pg, params.tournamentId, req.user.id);
  });

  app.get('/admin/tournaments', admin, async () => ({
    tournaments: await listAdminTournaments(app.pg),
  }));

  app.get('/admin/tournaments/pending-applications', admin, async () => ({
    count: await countPendingTournamentApplications(app.pg),
  }));

  app.get('/admin/tournaments/:tournamentId', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    return { tournament: await getTournament(app.pg, params.tournamentId) };
  });

  app.get('/admin/tournaments/:tournamentId/participants', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    return { participants: await listTournamentParticipants(app.pg, params.tournamentId) };
  });

  app.get('/admin/tournaments/:tournamentId/schedule', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    await getTournament(app.pg, params.tournamentId);
    const [fixtures, matchdays] = await Promise.all([
      getTournamentSchedule(app.pg, params.tournamentId),
      getTournamentMatchdays(app.pg, params.tournamentId),
    ]);
    return { fixtures, matchdays };
  });

  app.get('/admin/tournaments/:tournamentId/standings', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    await getTournament(app.pg, params.tournamentId);
    await refreshCompletedTournamentDailyResultsForTournament(app.pg, {
      tournamentId: params.tournamentId,
      now: new Date(),
    });
    return { standings: await getTournamentStandings(app.pg, params.tournamentId) };
  });

  app.get('/admin/tournaments/:tournamentId/bracket', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    await getTournament(app.pg, params.tournamentId);
    return { series: await getTournamentBracket(app.pg, params.tournamentId) };
  });

  app.post('/admin/tournaments/media/artwork', admin, async (req, reply) => {
    if (options.objectStorage === undefined) {
      throw new AppError('storage_not_configured', 'object storage is not configured', 503);
    }
    const body = req.body;
    if (!(body instanceof Buffer) || body.byteLength === 0) {
      throw new AppError('bad_request', 'empty tournament artwork', 400);
    }
    if (body.byteLength > options.objectStorage.maxUploadBytes) {
      throw new AppError('payload_too_large', 'tournament artwork is too large', 413);
    }
    let metadata: Metadata;
    try {
      metadata = await sharp(body, {
        failOn: 'warning',
        limitInputPixels: TOURNAMENT_ARTWORK_MAX_PIXELS,
      }).metadata();
    } catch {
      throw new AppError('invalid_webp', 'invalid tournament artwork', 415);
    }
    if (metadata.format !== 'webp') {
      throw new AppError('unsupported_media_type', 'tournament artwork must be WebP', 415);
    }
    if (
      metadata.width === undefined ||
      metadata.height === undefined ||
      metadata.width !== metadata.height ||
      metadata.width * metadata.height > TOURNAMENT_ARTWORK_MAX_PIXELS
    ) {
      throw new AppError('invalid_dimensions', 'tournament artwork must be square', 400);
    }
    const key = createMediaObjectKey({
      prefix: 'tournaments/artwork',
      contentType: 'image/webp',
    });
    let uploaded: ObjectStorageUploadResult;
    try {
      uploaded = await options.objectStorage.uploadObject({
        key,
        body,
        contentType: 'image/webp',
      });
    } catch (error) {
      app.log.error({ err: error, key }, 'tournament artwork upload failed');
      throw new AppError('storage_upload_failed', 'Не удалось загрузить изображение', 502);
    }
    try {
      const rawName = Array.isArray(req.headers['x-file-name'])
        ? req.headers['x-file-name'][0]
        : req.headers['x-file-name'];
      const originalName = (rawName ?? 'tournament.webp').slice(0, 160);
      const saved = await app.pg.query<{ id: string; object_key: string }>(
        `insert into media_objects
           (owner_user_id, purpose, object_key, url, content_type, size_bytes, original_name)
         values ($1, 'tournament_artwork', $2, $3, 'image/webp', $4, $5)
         returning id, object_key`,
        [req.user.id, uploaded.key, uploaded.url, body.byteLength, originalName],
      );
      const media = saved.rows[0];
      if (media === undefined) throw new Error('tournament artwork row was not returned');
      reply.code(201);
      return {
        url: createMediaProxyUrl(options.mediaAccessSecret, media.id),
        objectKey: media.object_key,
      };
    } catch (error) {
      try {
        await options.objectStorage.deleteObject({ key: uploaded.key });
      } catch (cleanupError) {
        app.log.error(
          { err: cleanupError, key: uploaded.key },
          'tournament artwork cleanup failed',
        );
      }
      throw error;
    }
  });

  app.post('/admin/tournaments', admin, async (req, reply) => {
    const body = draftSchema.parse(req.body);
    const tournament = await createTournamentDraft(app.pg, {
      ...(body.slug !== undefined ? { slug: body.slug } : {}),
      title: body.title,
      description: body.description,
      ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
      rules: parseRules(body.rules, { markNewAutomaticLifecycle: true }),
      createdBy: req.user.id,
      registrationOpensAt:
        body.registrationOpensAt === null ? null : new Date(body.registrationOpensAt),
      registrationClosesAt:
        body.registrationClosesAt === null ? null : new Date(body.registrationClosesAt),
      startsAt: body.startsAt === null ? null : new Date(body.startsAt),
    });
    reply.status(201);
    return { tournament };
  });

  app.patch('/admin/tournaments/:tournamentId', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    const body = updateSchema.parse(req.body);
    return {
      tournament: await updateTournamentDraft(app.pg, {
        tournamentId: params.tournamentId,
        expectedRevision: body.expectedRevision,
        title: body.title,
        description: body.description,
        ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
        rules: parseRules(body.rules),
        updatedBy: req.user.id,
        registrationOpensAt:
          body.registrationOpensAt === null ? null : new Date(body.registrationOpensAt),
        registrationClosesAt:
          body.registrationClosesAt === null ? null : new Date(body.registrationClosesAt),
        startsAt: body.startsAt === null ? null : new Date(body.startsAt),
      }),
    };
  });

  app.patch('/admin/tournaments/:tournamentId/rewards', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    const body = z
      .object({
        expectedRevision: z.number().int().min(1),
        regular: stageRewardsSchema.optional(),
        playoff: stageRewardsSchema.optional(),
      })
      .refine((value) => value.regular !== undefined || value.playoff !== undefined, {
        message: 'at least one reward stage is required',
      })
      .parse(req.body);
    return {
      tournament: await updateTournamentRewards(app.pg, {
        tournamentId: params.tournamentId,
        expectedRevision: body.expectedRevision,
        updatedBy: req.user.id,
        ...(body.regular !== undefined ? { regular: body.regular } : {}),
        ...(body.playoff !== undefined ? { playoff: body.playoff } : {}),
      }),
    };
  });

  app.post('/admin/tournaments/:tournamentId/publish', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    const body = z.object({ expectedRevision: z.number().int().min(1) }).parse(req.body);
    return publishTournament(app.pg, params.tournamentId, body.expectedRevision, req.user.id);
  });

  app.post('/admin/tournaments/:tournamentId/duplicate', admin, async (req, reply) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    const body = z
      .object({
        slug: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .optional(),
        title: z.string().trim().min(1).max(160),
      })
      .parse(req.body);
    const tournament = await duplicateTournamentDraft(app.pg, {
      tournamentId: params.tournamentId,
      ...(body.slug !== undefined ? { slug: body.slug } : {}),
      title: body.title,
      createdBy: req.user.id,
    });
    reply.status(201);
    return { tournament };
  });

  app.post('/admin/tournaments/:tournamentId/invitations', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    const body = z.object({ userId: uuid }).parse(req.body);
    return inviteTournamentParticipant(app.pg, params.tournamentId, body.userId, req.user.id);
  });

  app.post('/admin/tournaments/:tournamentId/participants/approve-all', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    return approveAllTournamentApplications(app.pg, params.tournamentId, req.user.id);
  });

  app.post(
    '/admin/tournaments/:tournamentId/participants/:participantId/approve',
    admin,
    async (req) => {
      const params = z.object({ tournamentId: uuid, participantId: uuid }).parse(req.params);
      return approveTournamentParticipant(
        app.pg,
        params.tournamentId,
        params.participantId,
        req.user.id,
      );
    },
  );

  app.post(
    '/admin/tournaments/:tournamentId/participants/:participantId/reject',
    admin,
    async (req) => {
      const params = z.object({ tournamentId: uuid, participantId: uuid }).parse(req.params);
      const body = z.object({ reason: z.string().trim().min(3).max(1000) }).parse(req.body);
      return rejectTournamentApplication(app.pg, {
        ...params,
        reason: body.reason,
        adminUserId: req.user.id,
      });
    },
  );

  app.post('/admin/tournaments/:tournamentId/cancel', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    const body = z.object({ expectedRevision: z.number().int().min(1) }).parse(req.body);
    return cancelTournament(app.pg, params.tournamentId, body.expectedRevision, req.user.id);
  });

  app.post('/admin/tournaments/:tournamentId/archive', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    return archiveTournament(app.pg, params.tournamentId, req.user.id);
  });

  app.post('/admin/tournaments/:tournamentId/pause', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    const body = z.object({ reason: z.string().trim().min(3).max(1000) }).parse(req.body);
    return pauseTournament(app.pg, { ...params, reason: body.reason, adminUserId: req.user.id });
  });

  app.post('/admin/tournaments/:tournamentId/resume', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    const body = z.object({ reason: z.string().trim().min(3).max(1000) }).parse(req.body);
    return resumeTournament(app.pg, { ...params, reason: body.reason, adminUserId: req.user.id });
  });

  app.post('/admin/tournaments/:tournamentId/schedule/generate', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    const body = z.object({ expectedRevision: z.number().int().min(1) }).parse(req.body);
    return generateRegularSchedule(app.pg, params.tournamentId, body.expectedRevision);
  });

  app.post('/admin/tournaments/:tournamentId/schedule/publish', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    return publishRegularSchedule(app.pg, params.tournamentId);
  });

  app.post('/admin/tournaments/:tournamentId/playoffs/start', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    return startTournamentPlayoffs(app.pg, params.tournamentId);
  });

  app.post('/admin/tournaments/:tournamentId/daily/:tournamentDay/finalize', admin, async (req) => {
    const params = z
      .object({ tournamentId: uuid, tournamentDay: z.coerce.number().int().min(1) })
      .parse(req.params);
    return finalizeTournamentDailyDay(app.pg, { ...params, now: new Date() });
  });

  app.post('/admin/tournaments/:tournamentId/rewards/:stage/grant', admin, async (req) => {
    const params = z
      .object({ tournamentId: uuid, stage: z.enum(['regular', 'playoff']) })
      .parse(req.params);
    return grantTournamentStageRewards(app.pg, params.tournamentId, params.stage);
  });

  app.patch('/admin/tournaments/:tournamentId/fixtures/:fixtureId/schedule', admin, async (req) => {
    const params = z.object({ tournamentId: uuid, fixtureId: uuid }).parse(req.params);
    const body = z
      .object({
        startsAt: z.string().datetime({ offset: true }),
        endsAt: z.string().datetime({ offset: true }),
        reason: z.string().trim().min(3).max(1000),
      })
      .refine((value) => new Date(value.startsAt) < new Date(value.endsAt), {
        message: 'fixture start must precede end',
      })
      .parse(req.body);
    const result = await rescheduleTournamentFixture(app.pg, {
      ...params,
      startsAt: new Date(body.startsAt),
      endsAt: new Date(body.endsAt),
      reason: body.reason,
      adminUserId: req.user.id,
    });
    await enqueueTournamentAudiencePush(app.pg, {
      tournamentId: params.tournamentId,
      eventType: 'tournament.rescheduled',
      eventKey: `${params.fixtureId}:rescheduled:${body.startsAt}`,
      variables: { startsAt: body.startsAt },
      fallback: {
        title: 'Матч перенесён',
        body: `Новое время: ${body.startsAt}`,
        url: '/?view=amateur&section=tournaments',
      },
    });
    return result;
  });

  app.post('/admin/tournaments/:tournamentId/fixtures/:fixtureId/no-show', admin, async (req) => {
    const params = z.object({ tournamentId: uuid, fixtureId: uuid }).parse(req.params);
    const body = z
      .object({
        absent: z.enum(['home', 'away', 'both']),
        reason: z.string().trim().min(3).max(1000),
      })
      .parse(req.body);
    return resolveTournamentNoShow(app.pg, { ...params, ...body, adminUserId: req.user.id });
  });

  app.post(
    '/admin/tournaments/:tournamentId/series/:seriesId/winner-decisions',
    admin,
    async (req, reply) => {
      const params = z.object({ tournamentId: uuid, seriesId: uuid }).parse(req.params);
      const body = z
        .object({
          winnerParticipantId: uuid,
          reason: z.string().trim().min(3).max(1000),
          idempotencyKey: z.string().trim().min(8).max(200),
        })
        .parse(req.body);
      const decision = await requestTournamentSeriesWinnerDecision(app.pg, {
        ...params,
        ...body,
        adminUserId: req.user.id,
      });
      reply.status(201);
      return decision;
    },
  );

  app.post(
    '/admin/tournaments/:tournamentId/series/:seriesId/winner-decisions/:decisionId/confirm',
    admin,
    async (req) => {
      const params = z
        .object({ tournamentId: uuid, seriesId: uuid, decisionId: uuid })
        .parse(req.params);
      return confirmTournamentSeriesWinnerDecision(app.pg, {
        ...params,
        adminUserId: req.user.id,
      });
    },
  );

  app.post(
    '/admin/tournaments/:tournamentId/participants/:participantId/disqualify',
    admin,
    async (req) => {
      const params = z.object({ tournamentId: uuid, participantId: uuid }).parse(req.params);
      const body = z.object({ reason: z.string().trim().min(3).max(1000) }).parse(req.body);
      return disqualifyTournamentParticipant(app.pg, {
        ...params,
        reason: body.reason,
        adminUserId: req.user.id,
      });
    },
  );

  app.delete('/admin/tournaments/:tournamentId', admin, async (req, reply) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    await deleteEmptyDraft(app.pg, params.tournamentId);
    reply.status(204).send();
  });
};
