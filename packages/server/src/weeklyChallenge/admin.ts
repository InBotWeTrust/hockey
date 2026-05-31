import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { assertAdminUser } from '../chat/channel.js';
import { AppError } from '../plugins/errors.js';
import { WEEKLY_CHALLENGE_TASK_TYPES, type WeeklyChallengeTaskType } from './types.js';

const taskSchema = z.object({
  type: z.enum(WEEKLY_CHALLENGE_TASK_TYPES),
  title: z.string().trim().max(120).optional(),
  target: z.number().int().min(1).max(1_000_000),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});

const challengeInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(''),
  joinOpenAt: z.string().datetime(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  rewardCoins: z.number().int().min(0).max(10_000_000).default(0),
  rewardStars: z.number().int().min(0).max(10_000_000).default(0),
  rewardExperience: z.number().int().min(0).max(10_000_000).default(0),
  tasks: z.array(taskSchema).min(1).max(12),
});

const paramsSchema = z.object({ id: z.string().uuid() });
const joinEnabledSchema = z.object({ joinEnabled: z.boolean() });

type AdminWeeklyChallengeInput = z.infer<typeof challengeInputSchema>;
type AdminWeeklyChallengeTaskInput = z.infer<typeof taskSchema>;

interface AdminWeeklyChallengeTaskDTO {
  id?: string;
  type: WeeklyChallengeTaskType;
  title: string | null;
  target: number;
  sortOrder: number;
}

interface AdminWeeklyChallengeDTO {
  id: string;
  title: string;
  description: string;
  joinOpenAt: string;
  startAt: string;
  endAt: string;
  isActive: boolean;
  joinEnabled: boolean;
  rewardCoins: number;
  rewardStars: number;
  rewardExperience: number;
  tasks: AdminWeeklyChallengeTaskDTO[];
  createdAt: string;
  updatedAt: string;
}

interface AdminWeeklyChallengeRow {
  id: string;
  title: string;
  description: string;
  join_open_at: Date | string;
  start_at: Date | string;
  end_at: Date | string;
  is_active: boolean;
  join_enabled: boolean;
  reward_coins: number;
  reward_stars: number;
  reward_experience: number;
  tasks: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

interface AdminWeeklyChallengeTaskRow {
  id: string;
  type: WeeklyChallengeTaskType;
  title: string | null;
  target: number;
  sort_order: number;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeTitle(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function assertValidTimeline(input: {
  joinOpenAt: string;
  startAt: string;
  endAt: string;
}): void {
  const joinOpenAt = new Date(input.joinOpenAt);
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  if (joinOpenAt.getTime() > startAt.getTime() || startAt.getTime() >= endAt.getTime()) {
    throw new AppError('bad_request', 'weekly challenge timeline is invalid', 400);
  }
}

function parseTasks(value: unknown): AdminWeeklyChallengeTaskRow[] {
  return Array.isArray(value) ? (value as AdminWeeklyChallengeTaskRow[]) : [];
}

function mapAdminChallengeRow(row: AdminWeeklyChallengeRow): AdminWeeklyChallengeDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    joinOpenAt: toIso(row.join_open_at),
    startAt: toIso(row.start_at),
    endAt: toIso(row.end_at),
    isActive: Boolean(row.is_active),
    joinEnabled: Boolean(row.join_enabled),
    rewardCoins: Number(row.reward_coins),
    rewardStars: Number(row.reward_stars),
    rewardExperience: Number(row.reward_experience),
    tasks: parseTasks(row.tasks).map((task) => ({
      id: task.id,
      type: task.type,
      title: task.title,
      target: Number(task.target),
      sortOrder: Number(task.sort_order),
    })),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
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
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

async function fetchAdminChallenge(
  client: PoolClient | FastifyInstance['pg'],
  challengeId: string,
): Promise<AdminWeeklyChallengeDTO> {
  const { rows } = await client.query<AdminWeeklyChallengeRow>(
    `select wc.*,
            coalesce(json_agg(wct order by wct.sort_order, wct.created_at)
              filter (where wct.id is not null), '[]'::json) as tasks
       from weekly_challenges wc
       left join weekly_challenge_tasks wct on wct.challenge_id = wc.id
      where wc.id = $1
      group by wc.id`,
    [challengeId],
  );
  const row = rows[0];
  if (!row) throw new AppError('not_found', 'weekly challenge not found', 404);
  return mapAdminChallengeRow(row);
}

async function replaceTasks(
  client: PoolClient,
  challengeId: string,
  tasks: AdminWeeklyChallengeTaskInput[],
): Promise<void> {
  await client.query(`delete from weekly_challenge_tasks where challenge_id = $1`, [challengeId]);
  for (const task of tasks) {
    await client.query(
      `insert into weekly_challenge_tasks (challenge_id, type, title, target, sort_order)
       values ($1, $2, $3, $4, $5)`,
      [challengeId, task.type, normalizeTitle(task.title), task.target, task.sortOrder],
    );
  }
}

async function createAdminWeeklyChallenge(
  client: PoolClient,
  adminUserId: string,
  input: AdminWeeklyChallengeInput,
): Promise<AdminWeeklyChallengeDTO> {
  const { rows } = await client.query<{ id: string }>(
    `insert into weekly_challenges
       (title, description, join_open_at, start_at, end_at,
        reward_coins, reward_stars, reward_experience, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning id`,
    [
      input.title,
      input.description,
      input.joinOpenAt,
      input.startAt,
      input.endAt,
      input.rewardCoins,
      input.rewardStars,
      input.rewardExperience,
      adminUserId,
    ],
  );
  const challengeId = rows[0]!.id;
  await replaceTasks(client, challengeId, input.tasks);
  return fetchAdminChallenge(client, challengeId);
}

async function patchAdminWeeklyChallenge(
  client: PoolClient,
  challengeId: string,
  input: AdminWeeklyChallengeInput,
): Promise<AdminWeeklyChallengeDTO> {
  const { rowCount } = await client.query(
    `update weekly_challenges
        set title = $2,
            description = $3,
            join_open_at = $4,
            start_at = $5,
            end_at = $6,
            reward_coins = $7,
            reward_stars = $8,
            reward_experience = $9,
            updated_at = now()
      where id = $1`,
    [
      challengeId,
      input.title,
      input.description,
      input.joinOpenAt,
      input.startAt,
      input.endAt,
      input.rewardCoins,
      input.rewardStars,
      input.rewardExperience,
    ],
  );
  if (rowCount === 0) throw new AppError('not_found', 'weekly challenge not found', 404);
  await replaceTasks(client, challengeId, input.tasks);
  return fetchAdminChallenge(client, challengeId);
}

export async function registerWeeklyChallengeAdminRoutes(app: FastifyInstance): Promise<void> {
  const adminPreHandlers = [
    app.authenticate,
    async (req: FastifyRequest) => {
      await assertAdminUser(app.pg, req.user.id);
    },
  ];

  app.get('/admin/weekly-challenges', { preHandler: adminPreHandlers }, async () => {
    const { rows } = await app.pg.query<AdminWeeklyChallengeRow>(
      `select wc.*,
              coalesce(json_agg(wct order by wct.sort_order, wct.created_at)
                filter (where wct.id is not null), '[]'::json) as tasks
         from weekly_challenges wc
         left join weekly_challenge_tasks wct on wct.challenge_id = wc.id
        group by wc.id
        order by wc.start_at desc`,
    );
    return { challenges: rows.map(mapAdminChallengeRow) };
  });

  app.post('/admin/weekly-challenges', { preHandler: adminPreHandlers }, async (req) => {
    const body = challengeInputSchema.safeParse(req.body);
    if (!body.success) throw new AppError('bad_request', 'invalid weekly challenge payload', 400);
    assertValidTimeline(body.data);
    const challenge = await withTransaction(app, (client) =>
      createAdminWeeklyChallenge(client, req.user.id, body.data),
    );
    return { challenge };
  });

  app.patch('/admin/weekly-challenges/:id', { preHandler: adminPreHandlers }, async (req) => {
    const params = paramsSchema.safeParse(req.params);
    const body = challengeInputSchema.safeParse(req.body);
    if (!params.success) throw new AppError('bad_request', 'invalid weekly challenge id', 400);
    if (!body.success) throw new AppError('bad_request', 'invalid weekly challenge payload', 400);
    assertValidTimeline(body.data);
    const challenge = await withTransaction(app, (client) =>
      patchAdminWeeklyChallenge(client, params.data.id, body.data),
    );
    return { challenge };
  });

  app.post('/admin/weekly-challenges/:id/activate', { preHandler: adminPreHandlers }, async (req) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success) throw new AppError('bad_request', 'invalid weekly challenge id', 400);
    const challenge = await withTransaction(app, async (client) => {
      await client.query(`update weekly_challenges set is_active = false where is_active`);
      const { rowCount } = await client.query(
        `update weekly_challenges
            set is_active = true,
                updated_at = now()
          where id = $1`,
        [params.data.id],
      );
      if (rowCount === 0) throw new AppError('not_found', 'weekly challenge not found', 404);
      return fetchAdminChallenge(client, params.data.id);
    });
    return { challenge };
  });

  app.post(
    '/admin/weekly-challenges/:id/deactivate',
    { preHandler: adminPreHandlers },
    async (req) => {
      const params = paramsSchema.safeParse(req.params);
      if (!params.success) throw new AppError('bad_request', 'invalid weekly challenge id', 400);
      const challenge = await withTransaction(app, async (client) => {
        const { rowCount } = await client.query(
          `update weekly_challenges
              set is_active = false,
                  updated_at = now()
            where id = $1`,
          [params.data.id],
        );
        if (rowCount === 0) throw new AppError('not_found', 'weekly challenge not found', 404);
        return fetchAdminChallenge(client, params.data.id);
      });
      return { challenge };
    },
  );

  app.post(
    '/admin/weekly-challenges/:id/join-enabled',
    { preHandler: adminPreHandlers },
    async (req) => {
      const params = paramsSchema.safeParse(req.params);
      const body = joinEnabledSchema.safeParse(req.body);
      if (!params.success) throw new AppError('bad_request', 'invalid weekly challenge id', 400);
      if (!body.success) throw new AppError('bad_request', 'invalid join enabled payload', 400);
      const challenge = await withTransaction(app, async (client) => {
        const { rowCount } = await client.query(
          `update weekly_challenges
              set join_enabled = $2,
                  updated_at = now()
            where id = $1`,
          [params.data.id, body.data.joinEnabled],
        );
        if (rowCount === 0) throw new AppError('not_found', 'weekly challenge not found', 404);
        return fetchAdminChallenge(client, params.data.id);
      });
      return { challenge };
    },
  );
}
