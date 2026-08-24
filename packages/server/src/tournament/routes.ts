import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { createTournamentDuelMatch } from '../duel/amateur/routes.js';
import { parseTournamentConfig } from './config.js';
import {
  applyToTournament,
  approveTournamentParticipant,
  archiveTournament,
  cancelTournament,
  createTournamentDraft,
  disqualifyTournamentParticipant,
  duplicateTournamentDraft,
  deleteEmptyDraft,
  getTournament,
  getTournamentSchedule,
  getTournamentStandings,
  getTournamentBracket,
  generateRegularSchedule,
  isTournamentFeatureEnabled,
  inviteTournamentParticipant,
  listAdminTournaments,
  listTournamentParticipants,
  listPlayerTournaments,
  publishTournament,
  publishRegularSchedule,
  startTournamentPlayoffs,
  rescheduleTournamentFixture,
  resolveTournamentNoShow,
  updateTournamentDraft,
  withdrawTournamentApplication,
  type TournamentRulesSnapshot,
} from './service.js';
import { openTournamentFixtureSegment } from './fixtureLifecycle.js';
import { publishTournamentFixtureProgress } from './realtimeProgress.js';
import { finalizeTournamentDailyDay } from './dailyAggregate.js';
import { grantTournamentStageRewards } from './rewards.js';
import {
  getFixtureLiveState,
  proposeFixtureLiveTime,
  respondFixtureLiveProposal,
} from './live.js';
import {
  enqueueTournamentAudiencePush,
  enqueueTournamentPush,
} from '../push/tournament.js';
import {
  dispatchTournamentCommunication,
  listTournamentDispatches,
  previewTournamentAudience,
} from './communications.js';

const uuid = z.string().uuid();
const nullableDate = z.string().datetime({ offset: true }).nullable().default(null);

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
    (rules) => rules.minLevel === null || rules.maxLevel === null || rules.minLevel <= rules.maxLevel,
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
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(10_000).default(''),
  rules: rulesSchema,
  registrationOpensAt: nullableDate,
  registrationClosesAt: nullableDate,
  startsAt: nullableDate,
});

const updateSchema = draftSchema.omit({ slug: true }).extend({
  expectedRevision: z.number().int().min(1),
});

function parseRules(input: z.infer<typeof rulesSchema>): TournamentRulesSnapshot {
  return {
    ...input,
    config: parseTournamentConfig(input.config),
    eligibility: input.eligibility,
  };
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
}

export const tournamentRoutes: FastifyPluginAsync<TournamentRoutesOptions> = async (app, options) => {
  const authenticated = { preHandler: [app.authenticate] };
  const admin = {
    preHandler: [app.authenticate, async (req: FastifyRequest) => requireAdmin(app, req)],
  };

  app.get('/tournaments', authenticated, async (req) => {
    await requireTournamentFeature(app);
    return { tournaments: await listPlayerTournaments(app.pg, req.user.id) };
  });

  app.get('/tournaments/:tournamentId', authenticated, async (req) => {
    await requireTournamentFeature(app);
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    return { tournament: await getTournament(app.pg, params.tournamentId, req.user.id) };
  });

  app.get('/tournaments/:tournamentId/schedule', authenticated, async (req) => {
    await requireTournamentFeature(app);
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    await getTournament(app.pg, params.tournamentId, req.user.id);
    return { fixtures: await getTournamentSchedule(app.pg, params.tournamentId) };
  });

  app.get('/tournaments/:tournamentId/standings', authenticated, async (req) => {
    await requireTournamentFeature(app);
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    await getTournament(app.pg, params.tournamentId, req.user.id);
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
        createTournamentDuelMatch,
      );
      await publishTournamentFixtureProgress(app.pg, app.realtime, app.log, {
        duelMatchId: opened.duelMatchId,
        sequence: Date.now(),
      });
      return opened;
    },
  );

  app.get('/admin/tournaments/:tournamentId/dispatches', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    return { dispatches: await listTournamentDispatches(app.pg, params.tournamentId) };
  });

  app.get('/admin/tournaments/:tournamentId/audience-preview', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    const query = z
      .object({ audience: z.enum(['approved', 'all_participants']).default('approved') })
      .parse(req.query);
    return previewTournamentAudience(app.pg, params.tournamentId, query.audience);
  });

  app.post('/admin/tournaments/:tournamentId/dispatches', admin, async (req, reply) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    const body = z
      .object({
        idempotencyKey: z.string().trim().min(8).max(200),
        kind: z.enum(['push', 'direct_message']),
        audience: z.enum(['approved', 'all_participants']),
        title: z.string().trim().min(1).max(120),
        body: z.string().trim().min(1).max(4000),
      })
      .parse(req.body);
    const result = await dispatchTournamentCommunication(app.pg, app.realtime, {
      tournamentId: params.tournamentId,
      ...body,
      createdBy: req.user.id,
      ...(options.systemUserId !== undefined ? { systemUserId: options.systemUserId } : {}),
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
    const result = await applyToTournament(app.pg, params.tournamentId, req.user.id);
    if (result.state === 'approved') {
      const tournament = await getTournament(app.pg, params.tournamentId, req.user.id);
      await enqueueTournamentPush(app.pg, {
        userId: req.user.id,
        eventType: 'tournament.application_approved',
        eventKey: `${params.tournamentId}:application-approved:${req.user.id}`,
        variables: { tournamentTitle: tournament.title },
        fallback: {
          title: 'Заявка подтверждена',
          body: `${tournament.title}: вы участвуете.`,
          url: '/?view=amateur&section=tournaments',
        },
      });
    }
    return result;
  });

  app.delete('/tournaments/:tournamentId/applications/me', authenticated, async (req) => {
    await requireTournamentFeature(app);
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    return withdrawTournamentApplication(app.pg, params.tournamentId, req.user.id);
  });

  app.get('/admin/tournaments', admin, async () => ({
    tournaments: await listAdminTournaments(app.pg),
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
    return { fixtures: await getTournamentSchedule(app.pg, params.tournamentId) };
  });

  app.get('/admin/tournaments/:tournamentId/standings', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    await getTournament(app.pg, params.tournamentId);
    return { standings: await getTournamentStandings(app.pg, params.tournamentId) };
  });

  app.get('/admin/tournaments/:tournamentId/bracket', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    await getTournament(app.pg, params.tournamentId);
    return { series: await getTournamentBracket(app.pg, params.tournamentId) };
  });

  app.post('/admin/tournaments', admin, async (req, reply) => {
    const body = draftSchema.parse(req.body);
    const tournament = await createTournamentDraft(app.pg, {
      slug: body.slug,
      title: body.title,
      description: body.description,
      rules: parseRules(body.rules),
      createdBy: req.user.id,
      registrationOpensAt: body.registrationOpensAt === null ? null : new Date(body.registrationOpensAt),
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

  app.post('/admin/tournaments/:tournamentId/publish', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    const body = z.object({ expectedRevision: z.number().int().min(1) }).parse(req.body);
    return publishTournament(app.pg, params.tournamentId, body.expectedRevision, req.user.id);
  });

  app.post('/admin/tournaments/:tournamentId/duplicate', admin, async (req, reply) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    const body = z.object({ slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), title: z.string().trim().min(1).max(160) }).parse(req.body);
    const tournament = await duplicateTournamentDraft(app.pg, {
      tournamentId: params.tournamentId,
      slug: body.slug,
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

  app.post(
    '/admin/tournaments/:tournamentId/participants/:participantId/approve',
    admin,
    async (req) => {
      const params = z
        .object({ tournamentId: uuid, participantId: uuid })
        .parse(req.params);
      const result = await approveTournamentParticipant(
        app.pg,
        params.tournamentId,
        params.participantId,
        req.user.id,
      );
      const participant = await app.pg.query<{ user_id: string; title: string }>(
        `select p.user_id, t.title from tournament_participant p
           join tournament t on t.id = p.tournament_id where p.id = $1`,
        [params.participantId],
      );
      if (participant.rows[0]) {
        await enqueueTournamentPush(app.pg, {
          userId: participant.rows[0].user_id,
          eventType: 'tournament.application_approved',
          eventKey: `${params.tournamentId}:application-approved:${participant.rows[0].user_id}`,
          variables: { tournamentTitle: participant.rows[0].title },
          fallback: {
            title: 'Заявка подтверждена',
            body: `${participant.rows[0].title}: вы участвуете.`,
            url: '/?view=amateur&section=tournaments',
          },
        });
      }
      return result;
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

  app.post('/admin/tournaments/:tournamentId/schedule/generate', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    const body = z.object({ expectedRevision: z.number().int().min(1) }).parse(req.body);
    return generateRegularSchedule(app.pg, params.tournamentId, body.expectedRevision);
  });

  app.post('/admin/tournaments/:tournamentId/schedule/publish', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    const result = await publishRegularSchedule(app.pg, params.tournamentId);
    const tournament = await getTournament(app.pg, params.tournamentId);
    await enqueueTournamentAudiencePush(app.pg, {
      tournamentId: params.tournamentId,
      eventType: 'tournament.schedule_published',
      eventKey: `${params.tournamentId}:schedule-published:${tournament.revision}`,
      variables: { tournamentTitle: tournament.title },
      fallback: {
        title: 'Календарь опубликован',
        body: `Расписание турнира ${tournament.title} готово.`,
        url: '/?view=amateur&section=tournaments',
      },
    });
    return result;
  });

  app.post('/admin/tournaments/:tournamentId/playoffs/start', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    const result = await startTournamentPlayoffs(app.pg, params.tournamentId);
    if (result.status === 'playoff') {
      const tournament = await getTournament(app.pg, params.tournamentId);
      await enqueueTournamentAudiencePush(app.pg, {
        tournamentId: params.tournamentId,
        eventType: 'tournament.playoff_started',
        eventKey: `${params.tournamentId}:playoff-started`,
        variables: { tournamentTitle: tournament.title },
        fallback: {
          title: 'Начинается плей-офф',
          body: `Сетка турнира ${tournament.title} опубликована.`,
          url: '/?view=amateur&section=tournaments',
        },
      });
    }
    return result;
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
    const result = await grantTournamentStageRewards(app.pg, params.tournamentId, params.stage);
    if (params.stage === 'playoff') {
      const tournament = await getTournament(app.pg, params.tournamentId);
      await enqueueTournamentAudiencePush(app.pg, {
        tournamentId: params.tournamentId,
        eventType: 'tournament.completed',
        eventKey: `${params.tournamentId}:completed`,
        variables: { tournamentTitle: tournament.title },
        fallback: {
          title: 'Турнир завершён',
          body: `${tournament.title} завершён. Проверьте итоги и награды.`,
          url: '/?view=amateur&section=tournaments',
        },
      });
    }
    return result;
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
      .object({ absent: z.enum(['home', 'away', 'both']), reason: z.string().trim().min(3).max(1000) })
      .parse(req.body);
    return resolveTournamentNoShow(app.pg, { ...params, ...body, adminUserId: req.user.id });
  });

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
