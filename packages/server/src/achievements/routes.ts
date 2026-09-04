import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { fetchAchievementCatalogueForUser } from './service.js';

const paramsSchema = z.object({
  achievementId: z.string().min(1).max(120),
});

interface ClaimableAchievementRow {
  achievement_id: string;
  title: string;
  claimed_at: Date | null;
  reward_currency: number | string;
  reward_stars: number | string;
  reward_experience: number | string;
}

interface BalanceRow {
  currency_balance: number | string;
  star_balance: number | string;
  experience: number | string;
}

export const achievementRoutes: FastifyPluginAsync = async (app) => {
  app.get('/achievements', { preHandler: [app.authenticate] }, async (req) => {
    const achievements = await fetchAchievementCatalogueForUser(app.pg, req.user.id);
    return {
      achievements,
      unclaimedCount: achievements.filter(
        (achievement) => achievement.status === 'completed_unclaimed',
      ).length,
    };
  });

  app.post(
    '/achievements/:achievementId/claim',
    { preHandler: [app.authenticate] },
    async (req) => {
      const params = paramsSchema.safeParse(req.params);
      if (!params.success) throw new AppError('bad_request', 'invalid achievement id', 400);

      const client = await app.pg.connect();
      try {
        await client.query('begin');
        // Global economy lock order: users before user_currency_account.
        const lockedUser = await client.query('select id from users where id = $1 for update', [
          req.user.id,
        ]);
        if (lockedUser.rowCount === 0) throw new AppError('not_found', 'user not found', 404);
        const { rows } = await client.query<ClaimableAchievementRow>(
          `select ua.achievement_id, ua.claimed_at, a.title,
                a.reward_currency, a.reward_stars, a.reward_experience
           from user_achievements ua
           join achievements a on a.id = ua.achievement_id
          where ua.user_id = $1 and ua.achievement_id = $2
          for update`,
          [req.user.id, params.data.achievementId],
        );
        const row = rows[0];
        if (!row) throw new AppError('not_found', 'achievement is not completed', 404);
        if (row.claimed_at !== null) {
          throw new AppError('conflict', 'achievement already claimed', 409);
        }

        await client.query(
          `update users
            set xp = xp + $2,
                experience = experience + $3
          where id = $1`,
          [req.user.id, row.reward_stars, row.reward_experience],
        );
        await client.query(
          `insert into user_currency_account (user_id) values ($1)
         on conflict do nothing`,
          [req.user.id],
        );
        const accountResult = await client.query<{
          balance: number | string;
          reserved_balance: number | string;
        }>(
          `update user_currency_account
            set balance = balance + $2, updated_at = now()
          where user_id = $1
          returning balance, reserved_balance`,
          [req.user.id, row.reward_currency],
        );
        const account = accountResult.rows[0];
        if (!account) throw new AppError('server_error', 'currency account missing', 500);
        await client.query(
          `insert into currency_ledger
             (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after, metadata)
           values ($1, 'achievement_reward', $2, 0, $3, $4, $5)`,
          [
            req.user.id,
            row.reward_currency,
            Number(account.balance),
            Number(account.reserved_balance),
            JSON.stringify({
              achievement_id: row.achievement_id,
              title: `Награда за достижение «${row.title}»`,
              stars: Number(row.reward_stars),
              experience: Number(row.reward_experience),
            }),
          ],
        );
        await client.query(
          `update user_achievements
            set claimed_at = now()
          where user_id = $1 and achievement_id = $2`,
          [req.user.id, params.data.achievementId],
        );
        await client.query('commit');

        const achievements = await fetchAchievementCatalogueForUser(app.pg, req.user.id);
        const claimed = achievements.find(
          (achievement) => achievement.id === params.data.achievementId,
        );
        const balances = await app.pg.query<BalanceRow>(
          `select coalesce(uca.balance, 0)::int as currency_balance,
                u.xp::int as star_balance,
                u.experience::int as experience
           from users u
           left join user_currency_account uca on uca.user_id = u.id
          where u.id = $1`,
          [req.user.id],
        );
        const balance = balances.rows[0];

        return {
          achievement: claimed,
          rewards: {
            currency: Number(row.reward_currency),
            stars: Number(row.reward_stars),
            experience: Number(row.reward_experience),
          },
          balances: {
            currencyBalance: Number(balance?.currency_balance ?? 0),
            starBalance: Number(balance?.star_balance ?? 0),
            experienceBalance: Number(balance?.experience ?? 0),
          },
          unclaimedCount: achievements.filter(
            (achievement) => achievement.status === 'completed_unclaimed',
          ).length,
        };
      } catch (err) {
        await client.query('rollback').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
  );
};
