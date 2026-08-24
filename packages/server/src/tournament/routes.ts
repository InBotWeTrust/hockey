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
  deleteEmptyDraft,
  getTournament,
  getTournamentSchedule,
  getTournamentStandings,
  generateRegularSchedule,
  isTournamentFeatureEnabled,
  inviteTournamentParticipant,
  listAdminTournaments,
  listPlayerTournaments,
  publishTournament,
  publishRegularSchedule,
  updateTournamentDraft,
  withdrawTournamentApplication,
  type TournamentRulesSnapshot,
} from './service.js';
import { openTournamentFixtureSegment } from './fixtureLifecycle.js';

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

export const tournamentRoutes: FastifyPluginAsync = async (app) => {
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

  app.post(
    '/tournaments/:tournamentId/fixtures/:fixtureId/segments/open',
    authenticated,
    async (req) => {
      await requireTournamentFeature(app);
      const params = z.object({ tournamentId: uuid, fixtureId: uuid }).parse(req.params);
      return openTournamentFixtureSegment(
        app.pg,
        { ...params, userId: req.user.id, now: new Date() },
        createTournamentDuelMatch,
      );
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

  app.get('/admin/tournaments/:tournamentId', admin, async (req) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    return { tournament: await getTournament(app.pg, params.tournamentId) };
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
      return approveTournamentParticipant(
        app.pg,
        params.tournamentId,
        params.participantId,
        req.user.id,
      );
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
    return publishRegularSchedule(app.pg, params.tournamentId);
  });

  app.delete('/admin/tournaments/:tournamentId', admin, async (req, reply) => {
    const params = z.object({ tournamentId: uuid }).parse(req.params);
    await deleteEmptyDraft(app.pg, params.tournamentId);
    reply.status(204).send();
  });
};
