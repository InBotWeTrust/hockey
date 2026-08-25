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
  completedCount: number;
}

interface AdminWeeklyChallengePlayerDTO {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  joinedAt: string;
  rewardClaimedAt: string | null;
  tasksCompleted: number;
  tasksTotal: number;
  progressPercent: number;
}

interface AdminWeeklyChallengeStatsDTO {
  participantsCount: number;
  completedCount: number;
  rewardClaimedCount: number;
  declinedCount: number;
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
  stats: AdminWeeklyChallengeStatsDTO;
  players: AdminWeeklyChallengePlayerDTO[];
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

interface AdminWeeklyChallengeStatsRow {
  challenge_id: string;
  participants_count: string;
  completed_count: string;
  reward_claimed_count: string;
  declined_count: string;
}

interface AdminWeeklyChallengeTaskStatsRow {
  task_id: string;
  completed_count: string;
}

interface AdminWeeklyChallengePlayerStatsRow {
  challenge_id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  joined_at: Date | string;
  reward_claimed_at: Date | string | null;
  tasks_completed: string;
  tasks_total: string;
  progress_percent: number | string;
}

interface AdminWeeklyChallengeEnrichment {
  stats: AdminWeeklyChallengeStatsDTO;
  players: AdminWeeklyChallengePlayerDTO[];
  taskCompletedCounts: Map<string, number>;
}

const emptyChallengeStats: AdminWeeklyChallengeStatsDTO = {
  participantsCount: 0,
  completedCount: 0,
  rewardClaimedCount: 0,
  declinedCount: 0,
};

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

function mapAdminChallengeRow(
  row: AdminWeeklyChallengeRow,
  enrichment?: AdminWeeklyChallengeEnrichment,
): AdminWeeklyChallengeDTO {
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
      completedCount: enrichment?.taskCompletedCounts.get(task.id) ?? 0,
    })),
    stats: enrichment?.stats ?? emptyChallengeStats,
    players: enrichment?.players ?? [],
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

async function fetchAdminChallengeEnrichment(
  db: PoolClient | FastifyInstance['pg'],
  challengeIds: string[],
): Promise<Map<string, AdminWeeklyChallengeEnrichment>> {
  const result = new Map<string, AdminWeeklyChallengeEnrichment>();
  for (const challengeId of challengeIds) {
    result.set(challengeId, {
      stats: emptyChallengeStats,
      players: [],
      taskCompletedCounts: new Map<string, number>(),
    });
  }
  if (challengeIds.length === 0) return result;

  const progressCte = `
    with participant_progress as (
      select p.challenge_id,
             p.user_id,
             p.joined_at,
             p.reward_claimed_at,
             u.display_name,
             u.avatar_url,
             (
               select count(*)::int
                 from shot_session ss
                where ss.user_id = p.user_id
                  and ss.server_result = 'goal'
                  and ss.created_at >= wc.start_at
                  and ss.created_at <= wc.end_at
             ) as goals_scored,
             (
               select count(*)::int
                 from amateur_duel_participant adp
                 join amateur_duel_match adm on adm.id = adp.match_id
                where adp.user_id = p.user_id
                  and adp.state = 'completed'
                  and adm.status = 'settled'
                  and coalesce(adm.settled_at, adm.updated_at) >= wc.start_at
                  and coalesce(adm.settled_at, adm.updated_at) <= wc.end_at
             ) as duels_played,
             (
               select count(*)::int
                 from amateur_duel_match adm
                where adm.winner_user_id = p.user_id
                  and adm.status = 'settled'
                  and coalesce(adm.settled_at, adm.updated_at) >= wc.start_at
                  and coalesce(adm.settled_at, adm.updated_at) <= wc.end_at
             ) as duels_won,
             (
               select count(*)::int
                 from amateur_duel_match adm
                where adm.challenger_user_id = p.user_id
                  and adm.source = 'challenge'
                  and adm.created_at >= wc.start_at
                  and adm.created_at <= wc.end_at
             ) as duel_invites_sent,
             (
               select count(*)::int
                 from training_session ts
                where ts.user_id = p.user_id
                  and ts.state = 'closed'
                  and coalesce(ts.closed_at, ts.started_at) >= wc.start_at
                  and coalesce(ts.closed_at, ts.started_at) <= wc.end_at
             ) as trainings_completed
        from weekly_challenge_participants p
        join weekly_challenges wc on wc.id = p.challenge_id
        join users u on u.id = p.user_id
       where p.challenge_id = any($1::uuid[])
    ),
    player_stats as (
      select pp.challenge_id,
             pp.user_id,
             pp.display_name,
             pp.avatar_url,
             pp.joined_at,
             pp.reward_claimed_at,
             count(t.id)::text as tasks_total,
             count(t.id) filter (
               where case t.type
                 when 'goals_scored' then pp.goals_scored
                 when 'duels_played' then pp.duels_played
                 when 'duels_won' then pp.duels_won
                 when 'duel_invites_sent' then pp.duel_invites_sent
                 when 'trainings_completed' then pp.trainings_completed
                 else 0
               end >= t.target
             )::text as tasks_completed,
             coalesce(
               round(
                 100 * sum(least(
                   (case t.type
                     when 'goals_scored' then pp.goals_scored
                     when 'duels_played' then pp.duels_played
                     when 'duels_won' then pp.duels_won
                     when 'duel_invites_sent' then pp.duel_invites_sent
                     when 'trainings_completed' then pp.trainings_completed
                     else 0
                   end)::numeric,
                   t.target::numeric
                 )) / nullif(sum(t.target), 0)
               )::int,
               0
             ) as progress_percent
        from participant_progress pp
        left join weekly_challenge_tasks t on t.challenge_id = pp.challenge_id
       group by pp.challenge_id,
                pp.user_id,
                pp.display_name,
                pp.avatar_url,
                pp.joined_at,
                pp.reward_claimed_at
    )
  `;

  const statsRows = await db.query<AdminWeeklyChallengeStatsRow>(
    `${progressCte}
      select wc.id as challenge_id,
             count(ps.user_id)::text as participants_count,
             count(ps.user_id) filter (
               where ps.tasks_total::int > 0 and ps.tasks_completed::int = ps.tasks_total::int
             )::text as completed_count,
             count(ps.user_id) filter (where ps.reward_claimed_at is not null)::text
               as reward_claimed_count,
             (
               select count(*)::text
                 from weekly_challenge_declines d
                where d.challenge_id = wc.id
             ) as declined_count
        from weekly_challenges wc
        left join player_stats ps on ps.challenge_id = wc.id
       where wc.id = any($1::uuid[])
       group by wc.id`,
    [challengeIds],
  );

  for (const row of statsRows.rows) {
    const current = result.get(row.challenge_id);
    if (!current) continue;
    current.stats = {
      participantsCount: Number(row.participants_count),
      completedCount: Number(row.completed_count),
      rewardClaimedCount: Number(row.reward_claimed_count),
      declinedCount: Number(row.declined_count),
    };
  }

  const taskRows = await db.query<AdminWeeklyChallengeTaskStatsRow>(
    `${progressCte}
      select t.id as task_id,
             count(pp.user_id) filter (
               where case t.type
                 when 'goals_scored' then pp.goals_scored
                 when 'duels_played' then pp.duels_played
                 when 'duels_won' then pp.duels_won
                 when 'duel_invites_sent' then pp.duel_invites_sent
                 when 'trainings_completed' then pp.trainings_completed
                 else 0
               end >= t.target
             )::text as completed_count
        from weekly_challenge_tasks t
        left join participant_progress pp on pp.challenge_id = t.challenge_id
       where t.challenge_id = any($1::uuid[])
       group by t.challenge_id, t.id`,
    [challengeIds],
  );

  for (const row of taskRows.rows) {
    for (const enrichment of result.values()) {
      enrichment.taskCompletedCounts.set(row.task_id, Number(row.completed_count));
    }
  }

  const playerRows = await db.query<AdminWeeklyChallengePlayerStatsRow>(
    `${progressCte}
      select challenge_id,
             user_id,
             display_name,
             avatar_url,
             joined_at,
             reward_claimed_at,
             tasks_completed,
             tasks_total,
             progress_percent
        from player_stats
       order by challenge_id, progress_percent desc, joined_at desc`,
    [challengeIds],
  );

  for (const row of playerRows.rows) {
    const current = result.get(row.challenge_id);
    if (!current) continue;
    current.players.push({
      userId: row.user_id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      joinedAt: toIso(row.joined_at),
      rewardClaimedAt: row.reward_claimed_at === null ? null : toIso(row.reward_claimed_at),
      tasksCompleted: Number(row.tasks_completed),
      tasksTotal: Number(row.tasks_total),
      progressPercent: Number(row.progress_percent),
    });
  }

  return result;
}

async function mapAdminChallengeRows(
  db: PoolClient | FastifyInstance['pg'],
  rows: AdminWeeklyChallengeRow[],
): Promise<AdminWeeklyChallengeDTO[]> {
  const ids = rows.map((row) => row.id);
  const enrichment = await fetchAdminChallengeEnrichment(db, ids);
  return rows.map((row) => mapAdminChallengeRow(row, enrichment.get(row.id)));
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
  return (await mapAdminChallengeRows(client, [row]))[0]!;
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
    return { challenges: await mapAdminChallengeRows(app.pg, rows) };
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
