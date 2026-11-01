import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { resolveAmateurAccess } from '../profile/amateurAccess.js';
import { AppError } from '../plugins/errors.js';
export const tourLocations = [
  'yard',
  'locker',
  'shop',
  'tasks',
  'chat',
  'bank',
  'stadium',
  'gym',
  'bar',
  'fame',
  'bonus',
  'pro',
  'profile',
] as const;
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('view'), location: z.enum(tourLocations) }).strict(),
  z.object({ action: z.enum(['dismiss', 'finish']) }).strict(),
]);
async function state(app: FastifyInstance, user: string) {
  const [result, access] = await Promise.all([
    app.pg.query<{
      viewed: string[];
      last_location: string;
      completed_at: Date | null;
      first_daily_period_started_at: Date | null;
      beginner_onboarding_completed: boolean;
    }>(
      `select t.viewed,t.last_location,t.completed_at,u.first_daily_period_started_at,u.beginner_onboarding_completed from user_city_tour t join users u on u.id=t.user_id where t.user_id=$1`,
      [user],
    ),
    resolveAmateurAccess(app.pg, user),
  ]);
  const row = result.rows[0]!;
  return {
    viewed: row.viewed,
    lastLocation: row.last_location,
    completed: row.completed_at !== null,
    gameStarted: row.first_daily_period_started_at !== null,
    eligible:
      row.beginner_onboarding_completed &&
      !access.hasFullAccess &&
      row.first_daily_period_started_at === null,
    target: access.unlockGoalsRequired,
  };
}
export const cityTourRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate] };
  const ensure = (id: string) =>
    app.pg.query('insert into user_city_tour(user_id) values($1) on conflict do nothing', [id]);
  app.post('/city-tour/open', auth, async (request) => {
    const id = request.user.id;
    await ensure(id);
    const snapshot = await state(app, id);
    const claim = snapshot.eligible
      ? await app.pg.query(
          'update user_city_tour set auto_offered_at=now() where user_id=$1 and auto_offered_at is null returning user_id',
          [id],
        )
      : null;
    return { ...snapshot, autoShow: claim?.rowCount === 1 };
  });
  app.post('/city-tour/action', auth, async (request) => {
    const parsed = actionSchema.safeParse(request.body);
    if (!parsed.success)
      throw new AppError('bad_request', 'Не удалось сохранить знакомство с городом.', 400);
    const id = request.user.id;
    await ensure(id);
    const input = parsed.data;
    if (input.action === 'view')
      await app.pg.query(
        `update user_city_tour set viewed=case when $2=any(viewed) then viewed else array_append(viewed,$2) end,last_location=$2,updated_at=now() where user_id=$1`,
        [id, input.location],
      );
    if (input.action === 'dismiss')
      await app.pg.query(
        'update user_city_tour set dismissed_at=coalesce(dismissed_at,now()),updated_at=now() where user_id=$1',
        [id],
      );
    if (input.action === 'finish')
      await app.pg.query(
        "update user_city_tour set completed_at=coalesce(completed_at,now()),last_location='yard',updated_at=now() where user_id=$1 and viewed @> $2::text[]",
        [id, tourLocations],
      );
    return state(app, id);
  });
};
