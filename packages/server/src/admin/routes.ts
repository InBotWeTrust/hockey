import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { DAILY_PERIOD_SPEED_PRESETS, GAME_CORE_VERSION, GOALIES, STICKS } from '@hockey/game-core';
import { AppError } from '../plugins/errors.js';
import { appendEvent } from '../duel/eventLog.js';
import { listGameSettings, saveGameSetting, type GameSettingDTO } from '../duel/gameSettings.js';

type UserRole = 'player' | 'admin';

interface AdminSummaryRow {
  total_users: string;
  admin_users: string;
  total_shots: string | null;
  total_goals: string | null;
  active_daily: string;
  active_training: string;
  shots_24h: string;
  goals_24h: string;
  mismatches_24h: string;
}

interface AdminUserRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role: UserRole;
  grip: 'left' | 'right';
  level: number;
  xp: number;
  timezone: string;
  created_at: Date;
  last_seen_at: Date | null;
  lifetime_shots_total: number;
  lifetime_goals_total: number;
  tg_id: string | null;
  vk_id: string | null;
  tg_username: string | null;
  vk_username: string | null;
  shots_current: number;
  shots_max: number;
  shots_bonus: number;
  pucks: string;
  gold_pucks: string;
  wheel_spins: number;
  training_energy: number;
  total_count?: string;
}

interface AdminShotModeRow {
  mode: string;
  shots: string;
  goals: string;
  last_shot_at: Date | null;
}

interface AdminEventRow {
  id: string;
  type: string;
  payload: unknown;
  created_at: Date;
}

const listUsersQuerySchema = z.object({
  q: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const userPatchSchema = z
  .object({
    role: z.enum(['player', 'admin']).optional(),
    displayName: z.string().trim().min(1).max(80).optional(),
    grip: z.enum(['left', 'right']).optional(),
    level: z.number().int().min(1).max(999).optional(),
    xp: z.number().int().min(0).max(2_147_483_647).optional(),
    lifetimeShotsTotal: z.number().int().min(0).max(2_147_483_647).optional(),
    lifetimeGoalsTotal: z.number().int().min(0).max(2_147_483_647).optional(),
    wallet: z
      .object({
        shotsCurrent: z.number().int().min(0).max(100_000).optional(),
        shotsMax: z.number().int().min(1).max(100_000).optional(),
        shotsBonus: z.number().int().min(0).max(100_000).optional(),
        pucks: z.number().int().min(0).max(9_000_000_000).optional(),
        goldPucks: z.number().int().min(0).max(9_000_000_000).optional(),
        wheelSpins: z.number().int().min(0).max(100_000).optional(),
        trainingEnergy: z.number().int().min(0).max(100_000).optional(),
      })
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.role !== undefined ||
      value.displayName !== undefined ||
      value.grip !== undefined ||
      value.level !== undefined ||
      value.xp !== undefined ||
      value.lifetimeShotsTotal !== undefined ||
      value.lifetimeGoalsTotal !== undefined ||
      (value.wallet !== undefined && Object.keys(value.wallet).length > 0),
    'no changes',
  );

const settingPatchSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]),
});

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
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

function mapUser(row: AdminUserRow) {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    grip: row.grip,
    level: row.level,
    xp: row.xp,
    timezone: row.timezone,
    createdAt: row.created_at.toISOString(),
    lastSeenAt: row.last_seen_at?.toISOString() ?? null,
    lifetimeShotsTotal: row.lifetime_shots_total,
    lifetimeGoalsTotal: row.lifetime_goals_total,
    providers: {
      telegram: row.tg_id !== null ? { id: row.tg_id, username: row.tg_username } : null,
      vk: row.vk_id !== null ? { id: row.vk_id, username: row.vk_username } : null,
    },
    wallet: {
      shotsCurrent: row.shots_current,
      shotsMax: row.shots_max,
      shotsBonus: row.shots_bonus,
      pucks: Number(row.pucks),
      goldPucks: Number(row.gold_pucks),
      wheelSpins: row.wheel_spins,
      trainingEnergy: row.training_energy,
    },
  };
}

async function requireAdmin(app: Parameters<FastifyPluginAsync>[0], req: FastifyRequest) {
  const { rows } = await app.pg.query<{ role: UserRole }>('select role from users where id = $1', [
    req.user.id,
  ]);
  if (rows[0]?.role !== 'admin') {
    throw new AppError('forbidden', 'admin role required', 403);
  }
}

async function fetchAdminUser(client: Pool | PoolClient, userId: string): Promise<AdminUserRow> {
  const { rows } = await client.query<AdminUserRow>(
    `select u.id, u.display_name, u.avatar_url, u.role, u.grip, u.level, u.xp,
            u.timezone, u.created_at, u.last_seen_at,
            u.lifetime_shots_total, u.lifetime_goals_total,
            tg.provider_uid as tg_id,
            vk.provider_uid as vk_id,
            u.tg_username,
            u.vk_username,
            coalesce(w.shots_current, 0) as shots_current,
            coalesce(w.shots_max, 25) as shots_max,
            coalesce(w.shots_bonus, 0) as shots_bonus,
            coalesce(w.pucks, 0) as pucks,
            coalesce(w.gold_pucks, 0) as gold_pucks,
            coalesce(w.wheel_spins, 0) as wheel_spins,
            coalesce(w.training_energy, 0) as training_energy
       from users u
       left join user_wallet w on w.user_id = u.id
       left join auth_providers tg
         on tg.user_id = u.id and tg.provider = 'telegram'
       left join auth_providers vk
         on vk.user_id = u.id and vk.provider = 'vk'
      where u.id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) throw new AppError('not_found', 'user not found', 404);
  return row;
}

function addAssignment(
  assignments: string[],
  values: unknown[],
  column: string,
  value: unknown,
): void {
  values.push(value);
  assignments.push(`${column} = $${values.length}`);
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  const adminPreHandlers = [
    app.authenticate,
    async (req: FastifyRequest) => requireAdmin(app, req),
  ];

  app.get('/admin/summary', { preHandler: adminPreHandlers }, async () => {
    const { rows } = await app.pg.query<AdminSummaryRow>(
      `select
         (select count(*) from users) as total_users,
         (select count(*) from users where role = 'admin') as admin_users,
         (select coalesce(sum(lifetime_shots_total), 0) from users) as total_shots,
         (select coalesce(sum(lifetime_goals_total), 0) from users) as total_goals,
         (select count(*) from day_pool where state <> 'closed') as active_daily,
         (select count(*) from training_session where state = 'active') as active_training,
         (select count(*) from shot_session where created_at >= now() - interval '24 hours')
           as shots_24h,
         (select count(*) from shot_session
           where created_at >= now() - interval '24 hours' and server_result = 'goal')
           as goals_24h,
         (select count(*) from event_log
           where created_at >= now() - interval '24 hours' and type = 'shot_mismatch')
           as mismatches_24h`,
    );
    const row = rows[0]!;
    return {
      users: {
        total: Number(row.total_users),
        admins: Number(row.admin_users),
      },
      lifetime: {
        shots: Number(row.total_shots ?? 0),
        goals: Number(row.total_goals ?? 0),
      },
      active: {
        daily: Number(row.active_daily),
        training: Number(row.active_training),
      },
      last24h: {
        shots: Number(row.shots_24h),
        goals: Number(row.goals_24h),
        mismatches: Number(row.mismatches_24h),
      },
      gameCoreVersion: GAME_CORE_VERSION,
    };
  });

  app.get('/admin/game-settings', { preHandler: adminPreHandlers }, async () => {
    const settings = await listGameSettings(app.pg);
    return {
      gameCoreVersion: GAME_CORE_VERSION,
      settings,
      balance: {
        goalies: GOALIES,
        sticks: STICKS,
        dailyPeriodSpeedPresets: DAILY_PERIOD_SPEED_PRESETS,
      },
    };
  });

  app.patch('/admin/game-settings/:key', { preHandler: adminPreHandlers }, async (req) => {
    const params = z.object({ key: z.string().min(1) }).parse(req.params);
    const body = settingPatchSchema.safeParse(req.body);
    if (!body.success) {
      throw new AppError('bad_request', 'invalid setting payload', 400);
    }

    let setting: GameSettingDTO;
    try {
      setting = await saveGameSetting(app.pg, params.key, body.data.value, req.user.id);
    } catch (err) {
      throw new AppError(
        'bad_request',
        err instanceof Error ? err.message : 'invalid game setting',
        400,
      );
    }
    await appendEvent(app.pg, req.user.id, 'admin_game_setting_updated', {
      key: params.key,
      value: setting.value,
    });
    return setting;
  });

  app.get('/admin/users', { preHandler: adminPreHandlers }, async (req) => {
    const parsed = listUsersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError('bad_request', 'invalid users query', 400);
    }
    const search = parsed.data.q ?? null;
    const { rows } = await app.pg.query<AdminUserRow>(
      `with filtered as (
         select u.id, u.display_name, u.avatar_url, u.role, u.grip, u.level, u.xp,
                u.timezone, u.created_at, u.last_seen_at,
                u.lifetime_shots_total, u.lifetime_goals_total,
                tg.provider_uid as tg_id,
                vk.provider_uid as vk_id,
                u.tg_username,
                u.vk_username,
                coalesce(w.shots_current, 0) as shots_current,
                coalesce(w.shots_max, 25) as shots_max,
                coalesce(w.shots_bonus, 0) as shots_bonus,
                coalesce(w.pucks, 0) as pucks,
                coalesce(w.gold_pucks, 0) as gold_pucks,
                coalesce(w.wheel_spins, 0) as wheel_spins,
                coalesce(w.training_energy, 0) as training_energy
           from users u
           left join user_wallet w on w.user_id = u.id
           left join auth_providers tg
             on tg.user_id = u.id and tg.provider = 'telegram'
           left join auth_providers vk
             on vk.user_id = u.id and vk.provider = 'vk'
          where $1::text is null
             or u.display_name ilike '%' || $1 || '%'
             or u.tg_username ilike '%' || $1 || '%'
             or u.vk_username ilike '%' || $1 || '%'
             or tg.provider_uid = $1
             or vk.provider_uid = $1
       )
       select *, count(*) over() as total_count
         from filtered
        order by created_at desc
        limit $2 offset $3`,
      [search, parsed.data.limit, parsed.data.offset],
    );
    return {
      users: rows.map(mapUser),
      total: rows.length > 0 ? Number(rows[0]!.total_count ?? rows.length) : 0,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    };
  });

  app.get('/admin/users/:userId', { preHandler: adminPreHandlers }, async (req) => {
    const params = z.object({ userId: z.string().uuid() }).parse(req.params);
    const user = await fetchAdminUser(app.pg, params.userId);
    const [shotModes, events] = await Promise.all([
      app.pg.query<AdminShotModeRow>(
        `select mode,
                count(*)::int as shots,
                count(*) filter (where server_result = 'goal')::int as goals,
                max(created_at) as last_shot_at
           from shot_session
          where user_id = $1
          group by mode
          order by mode`,
        [params.userId],
      ),
      app.pg.query<AdminEventRow>(
        `select id::text, type, payload, created_at
           from event_log
          where user_id = $1
          order by created_at desc
          limit 20`,
        [params.userId],
      ),
    ]);
    return {
      user: mapUser(user),
      shotModes: shotModes.rows.map((row) => ({
        mode: row.mode,
        shots: Number(row.shots),
        goals: Number(row.goals),
        lastShotAt: row.last_shot_at?.toISOString() ?? null,
      })),
      events: events.rows.map((row) => ({
        id: row.id,
        type: row.type,
        payload: row.payload,
        createdAt: row.created_at.toISOString(),
      })),
    };
  });

  app.patch('/admin/users/:userId', { preHandler: adminPreHandlers }, async (req) => {
    const params = z.object({ userId: z.string().uuid() }).parse(req.params);
    const body = userPatchSchema.safeParse(req.body);
    if (!body.success) {
      throw new AppError('bad_request', 'invalid user patch', 400);
    }

    return withTransaction(app, async (client) => {
      await fetchAdminUser(client, params.userId);
      if (params.userId === req.user.id && body.data.role === 'player') {
        throw new AppError('conflict', 'cannot demote yourself', 409);
      }

      const changed: string[] = [];
      const userAssignments: string[] = [];
      const userValues: unknown[] = [];
      if (body.data.role !== undefined) {
        addAssignment(userAssignments, userValues, 'role', body.data.role);
        changed.push('role');
      }
      if (body.data.displayName !== undefined) {
        addAssignment(userAssignments, userValues, 'display_name', body.data.displayName);
        changed.push('displayName');
      }
      if (body.data.grip !== undefined) {
        addAssignment(userAssignments, userValues, 'grip', body.data.grip);
        changed.push('grip');
      }
      if (body.data.level !== undefined) {
        addAssignment(userAssignments, userValues, 'level', body.data.level);
        changed.push('level');
      }
      if (body.data.xp !== undefined) {
        addAssignment(userAssignments, userValues, 'xp', body.data.xp);
        changed.push('xp');
      }
      if (body.data.lifetimeShotsTotal !== undefined) {
        addAssignment(
          userAssignments,
          userValues,
          'lifetime_shots_total',
          body.data.lifetimeShotsTotal,
        );
        changed.push('lifetimeShotsTotal');
      }
      if (body.data.lifetimeGoalsTotal !== undefined) {
        addAssignment(
          userAssignments,
          userValues,
          'lifetime_goals_total',
          body.data.lifetimeGoalsTotal,
        );
        changed.push('lifetimeGoalsTotal');
      }
      if (userAssignments.length > 0) {
        userValues.push(params.userId);
        await client.query(
          `update users set ${userAssignments.join(', ')} where id = $${userValues.length}`,
          userValues,
        );
      }

      const wallet = body.data.wallet;
      if (wallet !== undefined && Object.keys(wallet).length > 0) {
        await client.query('insert into user_wallet (user_id) values ($1) on conflict do nothing', [
          params.userId,
        ]);
        const walletAssignments: string[] = [];
        const walletValues: unknown[] = [];
        if (wallet.shotsCurrent !== undefined) {
          addAssignment(walletAssignments, walletValues, 'shots_current', wallet.shotsCurrent);
          changed.push('wallet.shotsCurrent');
        }
        if (wallet.shotsMax !== undefined) {
          addAssignment(walletAssignments, walletValues, 'shots_max', wallet.shotsMax);
          changed.push('wallet.shotsMax');
        }
        if (wallet.shotsBonus !== undefined) {
          addAssignment(walletAssignments, walletValues, 'shots_bonus', wallet.shotsBonus);
          changed.push('wallet.shotsBonus');
        }
        if (wallet.pucks !== undefined) {
          addAssignment(walletAssignments, walletValues, 'pucks', wallet.pucks);
          changed.push('wallet.pucks');
        }
        if (wallet.goldPucks !== undefined) {
          addAssignment(walletAssignments, walletValues, 'gold_pucks', wallet.goldPucks);
          changed.push('wallet.goldPucks');
        }
        if (wallet.wheelSpins !== undefined) {
          addAssignment(walletAssignments, walletValues, 'wheel_spins', wallet.wheelSpins);
          changed.push('wallet.wheelSpins');
        }
        if (wallet.trainingEnergy !== undefined) {
          addAssignment(walletAssignments, walletValues, 'training_energy', wallet.trainingEnergy);
          changed.push('wallet.trainingEnergy');
        }
        walletValues.push(params.userId);
        await client.query(
          `update user_wallet
              set ${walletAssignments.join(', ')}
            where user_id = $${walletValues.length}`,
          walletValues,
        );
      }

      await appendEvent(client, params.userId, 'admin_user_updated', {
        admin_user_id: req.user.id,
        fields: changed,
      });
      const updated = await fetchAdminUser(client, params.userId);
      return { user: mapUser(updated) };
    });
  });
};
