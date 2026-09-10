import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { assertAdminUser } from '../chat/channel.js';
import { AppError } from '../plugins/errors.js';
import { reconcileWeeklyChallengeLifecycle } from './lifecycle.js';
import { getWeeklyChallengeWindow } from './schedule.js';
import { WEEKLY_CHALLENGE_TASK_TYPES, type WeeklyChallengeTaskType } from './types.js';

const taskSchema = z
  .object({
    type: z.enum(WEEKLY_CHALLENGE_TASK_TYPES),
    title: z.string().trim().max(120).optional(),
    target: z.number().int().min(1).max(1_000_000),
    sortOrder: z.number().int().min(0).max(10_000).default(0),
  })
  .strict();

const nextChallengeInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).default(''),
    rewardCoins: z.number().int().min(0).max(10_000_000),
    rewardStars: z.number().int().min(0).max(10_000_000),
    rewardExperience: z.number().int().min(0).max(10_000_000),
    rewardTokens: z.number().int().min(0).max(10_000_000),
    tasks: z.array(taskSchema).min(1).max(12),
  })
  .strict();
const settingsSchema = z.object({ enabled: z.boolean() }).strict();

interface TaskRow {
  id: string;
  type: WeeklyChallengeTaskType;
  title: string | null;
  target: number;
  sort_order: number;
}

interface ChallengeRow {
  id: string;
  title: string;
  description: string;
  start_at: Date;
  end_at: Date;
  is_active: boolean;
  is_automatic: boolean;
  launched_at: Date | null;
  reward_coins: number;
  reward_stars: number;
  reward_experience: number;
  reward_tokens: number;
  tasks: TaskRow[];
  created_at: Date;
  updated_at: Date;
}

interface Player {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  rewardClaimedAt: string | null;
  tasksCompleted: number;
  tasksTotal: number;
  progressPercent: number;
}

interface PlayerTaskRow {
  challenge_id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  claimed_at: Date | null;
  task_id: string;
  target: number;
  progress: string;
}

async function fetchDashboard(client: PoolClient, now: Date) {
  const settings = await client.query<{ enabled: boolean }>(
    `select enabled from weekly_challenge_settings where id = true`,
  );
  const enabled = settings.rows[0]?.enabled === true;
  const { rows } = await client.query<ChallengeRow>(
    `select wc.*, coalesce(json_agg(t order by t.sort_order, t.created_at)
       filter (where t.id is not null), '[]'::json) as tasks
       from weekly_challenges wc
       left join weekly_challenge_tasks t on t.challenge_id = wc.id
      group by wc.id order by wc.start_at desc, wc.id`,
  );
  const currentRow = rows.find((row) => row.is_active && row.start_at <= now && now < row.end_at);
  const nextRow = rows
    .filter(
      (row) => row.is_automatic && row.launched_at === null && !row.is_active && row.start_at > now,
    )
    .sort((a, b) => a.start_at.getTime() - b.start_at.getTime())[0];
  const historyRows = rows.filter(
    (row) => row.end_at <= now && (!row.is_automatic || row.launched_at !== null),
  );
  const displayed = [
    ...(currentRow ? [currentRow] : []),
    ...(nextRow ? [nextRow] : []),
    ...historyRows,
  ];
  const ids = displayed.map((row) => row.id);

  // Only users with positive progress in a configured task are engaged. The
  // event sources and half-open boundaries match player progress calculation.
  const progress =
    ids.length === 0
      ? []
      : (
          await client.query<PlayerTaskRow>(
            `with source_events as (
       select user_id::text, 'goals_scored' as type, created_at as occurred_at
         from shot_session where server_result = 'goal'
       union all
       select p.user_id::text, 'duels_played', coalesce(m.settled_at, m.updated_at)
         from amateur_duel_participant p join amateur_duel_match m on m.id = p.match_id
        where p.state = 'completed' and m.status = 'settled'
       union all
       select p.user_id::text, 'duels_won', coalesce(m.settled_at, m.updated_at)
         from amateur_duel_participant p join amateur_duel_match m on m.id = p.match_id
        where m.status = 'settled' and m.winner_user_id = p.user_id
       union all
       select payload->>'challenger_user_id', 'duel_invites_sent', created_at
         from event_log where type = 'amateur_duel_challenge_accepted'
       union all
       select user_id::text, 'trainings_completed', coalesce(closed_at, started_at)
         from training_session where state = 'closed'
     ), task_progress as (
       select wc.id as challenge_id, t.id as task_id, e.user_id, count(*) as progress
         from weekly_challenges wc
         join weekly_challenge_tasks t on t.challenge_id = wc.id
         join source_events e on e.type = t.type
          and e.occurred_at >= wc.start_at and e.occurred_at < wc.end_at
        where wc.id = any($1::uuid[])
        group by wc.id, t.id, e.user_id
     ), engaged_users as (
       select distinct challenge_id, user_id from task_progress
     )
     select e.challenge_id, u.id as user_id, u.display_name, u.avatar_url,
            claims.claimed_at, t.id as task_id, t.target, coalesce(p.progress, 0)::text as progress
       from engaged_users e
       join users u on u.id::text = e.user_id
       join weekly_challenge_tasks t on t.challenge_id = e.challenge_id
       left join task_progress p on p.task_id = t.id and p.user_id = e.user_id
       left join weekly_challenge_reward_claims claims
         on claims.challenge_id = e.challenge_id and claims.user_id = u.id`,
            [ids],
          )
        ).rows;
  const challenges = displayed.map((row) => {
    const playerMap = new Map<string, Player & { achieved: number; target: number }>();
    const taskCounts = new Map<string, number>();
    for (const task of progress) {
      if (task.challenge_id !== row.id) continue;
      const player = playerMap.get(task.user_id) ?? {
        userId: task.user_id,
        displayName: task.display_name,
        avatarUrl: task.avatar_url,
        rewardClaimedAt: task.claimed_at?.toISOString() ?? null,
        tasksCompleted: 0,
        tasksTotal: 0,
        progressPercent: 0,
        achieved: 0,
        target: 0,
      };
      player.tasksTotal += 1;
      player.target += task.target;
      player.achieved += Math.min(Number(task.progress), task.target);
      if (Number(task.progress) >= task.target) {
        player.tasksCompleted += 1;
        taskCounts.set(task.task_id, (taskCounts.get(task.task_id) ?? 0) + 1);
      }
      playerMap.set(task.user_id, player);
    }
    const players: Player[] = [...playerMap.values()]
      .map(({ achieved, target, ...player }) => ({
        ...player,
        progressPercent: Math.round((100 * achieved) / target),
      }))
      .sort((a, b) => b.progressPercent - a.progressPercent || a.userId.localeCompare(b.userId));
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      startAt: row.start_at.toISOString(),
      endAt: row.end_at.toISOString(),
      isActive: row.is_active,
      rewardCoins: row.reward_coins,
      rewardStars: row.reward_stars,
      rewardExperience: row.reward_experience,
      rewardTokens: row.reward_tokens,
      tasks: row.tasks.map((task) => ({
        id: task.id,
        type: task.type,
        title: task.title,
        target: task.target,
        sortOrder: task.sort_order,
        completedCount: taskCounts.get(task.id) ?? 0,
      })),
      stats: {
        participantsCount: players.length,
        completedCount: players.filter((player) => player.tasksCompleted === player.tasksTotal)
          .length,
        rewardClaimedCount: players.filter((player) => player.rewardClaimedAt !== null).length,
      },
      players,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  });
  return {
    enabled,
    current: challenges.find((row) => row.id === currentRow?.id) ?? null,
    next: challenges.find((row) => row.id === nextRow?.id) ?? null,
    history: challenges.filter((row) => historyRows.some((history) => history.id === row.id)),
  };
}

async function withTransaction<T>(
  app: FastifyInstance,
  fn: (client: PoolClient, now: Date) => Promise<T>,
): Promise<T> {
  const client = await app.pg.connect();
  try {
    await client.query('begin');
    // Capture time after the lifecycle lock: an edit queued across Monday
    // must select the new next week, never a challenge that has started.
    await client.query(`select id from weekly_challenge_settings where id = true for update`);
    const now = new Date();
    await reconcileWeeklyChallengeLifecycle(client, now);
    const result = await fn(client, now);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function registerWeeklyChallengeAdminRoutes(app: FastifyInstance): Promise<void> {
  const preHandler = [
    app.authenticate,
    async (req: FastifyRequest) => {
      await assertAdminUser(app.pg, req.user.id);
    },
  ];

  app.get('/admin/weekly-challenges', { preHandler }, async () =>
    withTransaction(app, fetchDashboard),
  );

  app.patch('/admin/weekly-challenges/settings', { preHandler }, async (req) => {
    const body = settingsSchema.safeParse(req.body);
    if (!body.success) throw new AppError('bad_request', 'invalid weekly challenge settings', 400);
    return withTransaction(app, async (client, now) => {
      await client.query(
        `update weekly_challenge_settings set enabled = $1, updated_at = now() where id = true`,
        [body.data.enabled],
      );
      await reconcileWeeklyChallengeLifecycle(client, now);
      return fetchDashboard(client, now);
    });
  });

  app.patch('/admin/weekly-challenges/next', { preHandler }, async (req) => {
    const body = nextChallengeInputSchema.safeParse(req.body);
    if (!body.success) throw new AppError('bad_request', 'invalid weekly challenge payload', 400);
    return withTransaction(app, async (client, now) => {
      const { rows } = await client.query<{ id: string }>(
        `select id from weekly_challenges
          where is_automatic and not is_active and launched_at is null and start_at > $1
          order by start_at, id limit 1 for update`,
        [now],
      );
      const input = body.data;
      let id = rows[0]?.id;
      if (!id) {
        const window = getWeeklyChallengeWindow(now);
        const inserted = await client.query<{ id: string }>(
          `insert into weekly_challenges
            (title, description, join_open_at, visible_from, start_at, end_at,
             is_automatic, is_active, join_enabled,
             reward_coins, reward_stars, reward_experience, reward_tokens, created_by)
           values ($1, $2, $3, $3, $4, $5, true, false, false, $6, $7, $8, $9, $10) returning id`,
          [
            input.title,
            input.description,
            window.nextVisibleFrom,
            window.nextStart,
            window.nextEnd,
            input.rewardCoins,
            input.rewardStars,
            input.rewardExperience,
            input.rewardTokens,
            req.user.id,
          ],
        );
        id = inserted.rows[0]!.id;
      }
      await client.query(
        `update weekly_challenges set title = $2, description = $3,
          reward_coins = $4, reward_stars = $5, reward_experience = $6, reward_tokens = $7, updated_at = now()
          where id = $1`,
        [
          id,
          input.title,
          input.description,
          input.rewardCoins,
          input.rewardStars,
          input.rewardExperience,
          input.rewardTokens,
        ],
      );
      await client.query(`delete from weekly_challenge_tasks where challenge_id = $1`, [id]);
      for (const task of input.tasks) {
        await client.query(
          `insert into weekly_challenge_tasks (challenge_id, type, title, target, sort_order)
          values ($1, $2, $3, $4, $5)`,
          [id, task.type, task.title?.trim() || null, task.target, task.sortOrder],
        );
      }
      return fetchDashboard(client, now);
    });
  });
}
