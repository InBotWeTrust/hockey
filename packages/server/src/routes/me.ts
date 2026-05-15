import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { recomputeEffectiveProfile, type DisplaySource } from '../auth/profile.js';
import { canUseExperimentalTrainingCourt } from '../auth/featureAccess.js';
import { AppError } from '../plugins/errors.js';
import { buildProfileProgress } from '../profile/summary.js';

interface MeRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role: 'player' | 'admin';
  grip: string;
  level: number;
  timezone: string;
  lifetime_shots_total: number;
  lifetime_goals_total: number;
  display_source: DisplaySource;
  custom_display_name: string | null;
  custom_first_name: string | null;
  custom_last_name: string | null;
  custom_avatar_url: string | null;
  tg_id: string | null;
  tg_first_name: string | null;
  tg_last_name: string | null;
  tg_avatar_url: string | null;
  tg_username: string | null;
  vk_first_name: string | null;
  vk_last_name: string | null;
  vk_avatar_url: string | null;
  vk_username: string | null;
  linked_providers: string[] | null;
  currency_balance: number;
}

async function getMe(app: Parameters<FastifyPluginAsync>[0], userId: string) {
  const { rows } = await app.pg.query<MeRow>(
    `select u.id, u.display_name, u.avatar_url, u.role, u.grip, u.level, u.timezone,
            u.lifetime_shots_total, u.lifetime_goals_total, u.display_source,
            u.custom_display_name, u.custom_first_name, u.custom_last_name, u.custom_avatar_url,
            tg.provider_uid as tg_id,
            u.tg_first_name, u.tg_last_name, u.tg_avatar_url, u.tg_username,
            u.vk_first_name, u.vk_last_name, u.vk_avatar_url, u.vk_username,
            coalesce(uca.balance, 0)::int as currency_balance,
            coalesce(
              (select array_agg(ap.provider order by ap.provider)
                 from auth_providers ap
                where ap.user_id = u.id),
              array[]::text[]
            ) as linked_providers
       from users u
       left join user_currency_account uca on uca.user_id = u.id
       left join auth_providers tg
         on tg.user_id = u.id and tg.provider = 'telegram'
      where u.id = $1`,
    [userId],
  );
  if (rows.length === 0) {
    throw new AppError('not_found', 'user not found', 404);
  }
  const row = rows[0]!;
  const profileProgress = await buildProfileProgress(app.pg, row);
  const experimentalTrainingCourt = await canUseExperimentalTrainingCourt(app.pg, {
    id: row.id,
    role: row.role,
  });

  return {
    id: row.id,
    displayName: row.display_name,
    ...(row.avatar_url !== null ? { avatarUrl: row.avatar_url } : {}),
    role: row.role,
    experimentalTrainingCourt,
    grip: row.grip as 'right' | 'left',
    competitionLevel: profileProgress.competitionLevel,
    stats: profileProgress.stats,
    achievements: profileProgress.achievements,
    currencyBalance: Number(row.currency_balance),
    displaySource: row.display_source,
    customDisplayName: row.custom_display_name,
    customFirstName: row.custom_first_name,
    customLastName: row.custom_last_name,
    customAvatarUrl: row.custom_avatar_url,
    linkedProviders: (row.linked_providers ?? []) as Array<'telegram' | 'vk'>,
    ...(row.tg_id !== null ? { tgId: row.tg_id } : {}),
    ...(row.tg_username !== null ? { username: row.tg_username } : {}),
    tgFirstName: row.tg_first_name,
    tgLastName: row.tg_last_name,
    tgAvatarUrl: row.tg_avatar_url,
    tgUsername: row.tg_username,
    vkFirstName: row.vk_first_name,
    vkLastName: row.vk_last_name,
    vkAvatarUrl: row.vk_avatar_url,
    vkUsername: row.vk_username,
  };
}

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me', { preHandler: [app.authenticate] }, async (req) => {
    return getMe(app, req.user.id);
  });

  app.patch('/me', { preHandler: [app.authenticate] }, async (req) => {
    const body = z
      .object({
        grip: z.enum(['right', 'left']).optional(),
        displaySource: z.enum(['telegram', 'vk', 'custom']).optional(),
        customFirstName: z.string().trim().min(1).max(60).optional(),
        customLastName: z.string().trim().min(1).max(60).optional(),
      })
      .refine(
        (value) =>
          value.grip !== undefined ||
          value.displaySource !== undefined ||
          value.customFirstName !== undefined ||
          value.customLastName !== undefined,
      )
      .safeParse(req.body);
    if (!body.success) {
      throw new AppError('bad_request', 'invalid body', 400);
    }

    if (body.data.grip !== undefined) {
      await app.pg.query('update users set grip = $1 where id = $2', [body.data.grip, req.user.id]);
    }

    if (body.data.customFirstName !== undefined || body.data.customLastName !== undefined) {
      if (body.data.customFirstName === undefined || body.data.customLastName === undefined) {
        throw new AppError('bad_request', 'custom_profile_incomplete', 400);
      }
      const customDisplayName = `${body.data.customFirstName} ${body.data.customLastName}`;
      await app.pg.query(
        `update users
            set display_source = 'custom',
                custom_first_name = $1,
                custom_last_name = $2,
                custom_display_name = $3
          where id = $4`,
        [body.data.customFirstName, body.data.customLastName, customDisplayName, req.user.id],
      );
      await recomputeEffectiveProfile(app.pg, req.user.id);
      return getMe(app, req.user.id);
    }

    if (body.data.displaySource !== undefined) {
      if (body.data.displaySource === 'custom') {
        await app.pg.query(
          `update users
              set display_source = 'custom',
                  custom_display_name = coalesce(custom_display_name, display_name)
            where id = $1`,
          [req.user.id],
        );
        await recomputeEffectiveProfile(app.pg, req.user.id);
        return getMe(app, req.user.id);
      }
      const provider = await app.pg.query(
        `select 1
           from auth_providers
          where user_id = $1 and provider = $2
          limit 1`,
        [req.user.id, body.data.displaySource],
      );
      if (provider.rowCount === 0) {
        throw new AppError('bad_request', 'display_source_unavailable', 400);
      }
      await app.pg.query('update users set display_source = $1 where id = $2', [
        body.data.displaySource,
        req.user.id,
      ]);
      await recomputeEffectiveProfile(app.pg, req.user.id);
    }

    return getMe(app, req.user.id);
  });
};
