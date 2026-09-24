import type { FastifyPluginAsync } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { createAdminPreHandlers } from '../admin/guards.js';
import { AppError } from '../plugins/errors.js';

const milestoneBody = z.object({
  qualifiedReferrals: z.number().int().min(1).max(1_000_000),
  rewardStars: z.number().int().min(1).max(1_000_000_000),
});

async function unlockMilestoneForEligibleInviters(
  client: PoolClient,
  milestoneId: string,
): Promise<number> {
  const result = await client.query(
    `insert into referral_reward_unlock
       (inviter_user_id, milestone_id, qualified_referrals_snapshot, reward_stars_snapshot)
     select relationship.inviter_user_id,
            milestone.id,
            milestone.qualified_referrals,
            milestone.reward_stars
       from referral_milestone milestone
       join referral_relationship relationship on relationship.qualified_at is not null
       join users invited on invited.id = relationship.invitee_user_id and invited.blocked_at is null
      where milestone.id = $1 and milestone.archived_at is null
      group by relationship.inviter_user_id, milestone.id
     having count(*) >= milestone.qualified_referrals
     on conflict (inviter_user_id, milestone_id) do nothing`,
    [milestoneId],
  );
  return result.rowCount ?? 0;
}

export const referralAdminRoutes: FastifyPluginAsync = async (app) => {
  const adminPreHandlers = createAdminPreHandlers(app);

  app.get('/admin/referrals', { preHandler: adminPreHandlers }, async (req) => {
    const query = z
      .object({
        q: z.string().trim().max(80).default(''),
        limit: z.coerce.number().int().min(1).max(50).default(20),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    const [summary, leaderboard] = await Promise.all([
      app.pg.query<{
        total_invitations: number;
        qualified_invitations: number;
        inviters: number;
        rewards_claimed: number;
        stars_issued: number;
      }>(
        `select count(*)::int as total_invitations,
                count(*) filter (where relationship.qualified_at is not null)::int
                  as qualified_invitations,
                count(distinct relationship.inviter_user_id)::int as inviters,
                (select count(*)::int from referral_reward_unlock where claimed_at is not null)
                  as rewards_claimed,
                (select coalesce(sum(reward_stars_snapshot), 0)::int
                   from referral_reward_unlock where claimed_at is not null) as stars_issued
           from referral_relationship relationship`,
      ),
      app.pg.query<{
        user_id: string;
        display_name: string;
        code: string;
        total_invited: number;
        qualified_invited: number;
        professionals: number;
        claimable_stars: number;
        claimed_stars: number;
        risk_signals: number;
        total_count: number;
      }>(
        `select inviter.id as user_id,
                inviter.display_name,
                code.code,
                count(distinct relationship.invitee_user_id)::int as total_invited,
                count(distinct relationship.invitee_user_id)
                  filter (where relationship.qualified_at is not null)::int as qualified_invited,
                count(distinct relationship.invitee_user_id)
                  filter (where invited.level >= 3)::int as professionals,
                coalesce((select sum(reward_stars_snapshot)::int
                            from referral_reward_unlock unlock
                           where unlock.inviter_user_id = inviter.id
                             and unlock.claimed_at is null), 0) as claimable_stars,
                coalesce((select sum(reward_stars_snapshot)::int
                            from referral_reward_unlock unlock
                           where unlock.inviter_user_id = inviter.id
                             and unlock.claimed_at is not null), 0) as claimed_stars,
                count(distinct risk.id)::int as risk_signals,
                count(*) over()::int as total_count
           from referral_relationship relationship
           join users inviter on inviter.id = relationship.inviter_user_id
           join users invited on invited.id = relationship.invitee_user_id
           join referral_code code on code.user_id = inviter.id
           left join lateral (
             select max(provider_uid) filter (where provider = 'telegram') as telegram_id,
                    max(provider_uid) filter (where provider = 'vk') as vk_id
               from auth_providers
              where user_id = inviter.id
           ) identities on true
           left join referral_risk_signal risk
             on risk.relationship_invitee_user_id = relationship.invitee_user_id
            and risk.expires_at > now()
          where ($1 = ''
                 or inviter.display_name ilike '%' || $1 || '%'
                 or inviter.tg_first_name ilike '%' || $1 || '%'
                 or inviter.tg_last_name ilike '%' || $1 || '%'
                 or inviter.vk_first_name ilike '%' || $1 || '%'
                 or inviter.vk_last_name ilike '%' || $1 || '%'
                 or identities.telegram_id = $1
                 or identities.vk_id = $1)
          group by inviter.id, inviter.display_name, code.code
          order by qualified_invited desc, total_invited desc, inviter.display_name
          limit $2 offset $3`,
        [query.q, query.limit, query.offset],
      ),
    ]);
    const row = summary.rows[0]!;
    return {
      summary: {
        totalInvitations: Number(row.total_invitations),
        qualifiedInvitations: Number(row.qualified_invitations),
        inviters: Number(row.inviters),
        rewardsClaimed: Number(row.rewards_claimed),
        starsIssued: Number(row.stars_issued),
      },
      inviters: leaderboard.rows.map((item) => ({
        userId: item.user_id,
        displayName: item.display_name,
        code: item.code,
        totalInvited: Number(item.total_invited),
        qualifiedInvited: Number(item.qualified_invited),
        professionals: Number(item.professionals),
        claimableStars: Number(item.claimable_stars),
        claimedStars: Number(item.claimed_stars),
        riskSignals: Number(item.risk_signals),
      })),
      total: Number(leaderboard.rows[0]?.total_count ?? 0),
    };
  });

  app.get('/admin/referrals/relationships', { preHandler: adminPreHandlers }, async (req) => {
    const query = z
      .object({
        q: z.string().trim().max(80).default(''),
        level: z.enum(['all', 'beginner', 'amateur', 'professional']).default('all'),
        risk: z.enum(['all', 'yes', 'no']).default('all'),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    const result = await app.pg.query(
      `with relationships as (
         select relationship.inviter_user_id,
                inviter.display_name as inviter_name,
                concat_ws(' ', inviter.tg_first_name, inviter.tg_last_name,
                  inviter.vk_first_name, inviter.vk_last_name) as inviter_provider_names,
                (select max(provider_uid) from auth_providers where user_id = inviter.id and provider = 'telegram') as inviter_telegram_id,
                (select max(provider_uid) from auth_providers where user_id = inviter.id and provider = 'vk') as inviter_vk_id,
                code.code,
                relationship.invitee_user_id,
                invited.display_name as invitee_name,
                concat_ws(' ', invited.tg_first_name, invited.tg_last_name,
                  invited.vk_first_name, invited.vk_last_name) as invitee_provider_names,
                (select max(provider_uid) from auth_providers where user_id = invited.id and provider = 'telegram') as invitee_telegram_id,
                (select max(provider_uid) from auth_providers where user_id = invited.id and provider = 'vk') as invitee_vk_id,
                invited.experience::int as experience,
                relationship.joined_at,
                relationship.qualified_at,
                case when invited.level >= 3 then 'professional'
                     when invited.level >= 2 or invited.lifetime_goals_total >= coalesce(
                       (select (value #>> '{}')::int from game_settings
                         where key = 'amateur.unlock_goals_required'), 300) then 'amateur'
                     else 'beginner' end as competition_level,
                count(risk.id) filter (where risk.expires_at > now())::int as risk_signals
           from referral_relationship relationship
           join users inviter on inviter.id = relationship.inviter_user_id
           join users invited on invited.id = relationship.invitee_user_id
           join referral_code code on code.user_id = inviter.id
           left join referral_risk_signal risk
             on risk.relationship_invitee_user_id = relationship.invitee_user_id
          group by relationship.inviter_user_id, inviter.id, inviter.display_name, code.code,
                   relationship.invitee_user_id, invited.id, invited.display_name, invited.experience,
                   invited.level, invited.lifetime_goals_total, relationship.joined_at,
                   relationship.qualified_at
       )
       select *, count(*) over()::int as total_count
         from relationships
        where ($1 = '' or inviter_name ilike '%' || $1 || '%'
                       or invitee_name ilike '%' || $1 || '%'
                       or inviter_provider_names ilike '%' || $1 || '%'
                       or invitee_provider_names ilike '%' || $1 || '%'
                       or inviter_telegram_id = $1 or inviter_vk_id = $1
                       or invitee_telegram_id = $1 or invitee_vk_id = $1)
          and ($2 = 'all' or competition_level = $2)
          and ($3 = 'all' or ($3 = 'yes' and risk_signals > 0) or ($3 = 'no' and risk_signals = 0))
        order by joined_at desc
        limit $4 offset $5`,
      [query.q, query.level, query.risk, query.limit, query.offset],
    );
    return { relationships: result.rows, total: Number(result.rows[0]?.total_count ?? 0) };
  });

  app.get('/admin/referrals/milestones', { preHandler: adminPreHandlers }, async () => {
    const { rows } = await app.pg.query(
      `select milestone.*,
              count(unlock.id) filter (where unlock.claimed_at is null)::int as unclaimed_count,
              count(unlock.id) filter (where unlock.claimed_at is not null)::int as claimed_count
         from referral_milestone milestone
         left join referral_reward_unlock unlock on unlock.milestone_id = milestone.id
        group by milestone.id
        order by milestone.sort_order, milestone.qualified_referrals`,
    );
    return { milestones: rows };
  });

  app.get('/admin/referrals/milestones/preview', { preHandler: adminPreHandlers }, async (req) => {
    const query = z.object({
      qualifiedReferrals: z.coerce.number().int().min(1),
      milestoneId: z.string().uuid().optional(),
    }).parse(req.query);
    const { rows } = await app.pg.query<{ count: number }>(
      `select count(*)::int as count
         from (
           select inviter_user_id
             from referral_relationship relationship
             join users invited on invited.id = relationship.invitee_user_id
            where relationship.qualified_at is not null and invited.blocked_at is null
            group by inviter_user_id
           having count(*) >= $1
              and ($2::uuid is null or not exists (
                select 1 from referral_reward_unlock unlock
                 where unlock.inviter_user_id = relationship.inviter_user_id
                   and unlock.milestone_id = $2::uuid
              ))
         ) eligible`,
      [query.qualifiedReferrals, query.milestoneId ?? null],
    );
    return { newlyEligibleCount: Number(rows[0]?.count ?? 0) };
  });

  app.post('/admin/referrals/milestones', { preHandler: adminPreHandlers }, async (req) => {
    const body = milestoneBody.safeParse(req.body);
    if (!body.success) throw new AppError('bad_request', 'invalid referral milestone', 400);
    const client = await app.pg.connect();
    try {
      await client.query('begin');
      const inserted = await client.query<{ id: string }>(
        `insert into referral_milestone (qualified_referrals, reward_stars, sort_order)
         values ($1, $2, $1)
         returning id`,
        [body.data.qualifiedReferrals, body.data.rewardStars],
      );
      const id = inserted.rows[0]!.id;
      const unlocked = await unlockMilestoneForEligibleInviters(client, id);
      await client.query(
        `insert into referral_milestone_audit
           (milestone_id, admin_user_id, action, after_value)
         values ($1, $2, 'created', $3)`,
        [id, req.user.id, JSON.stringify(body.data)],
      );
      await client.query('commit');
      return { id, newlyUnlockedCount: unlocked };
    } catch (error) {
      await client.query('rollback');
      if ((error as { code?: string }).code === '23505') {
        throw new AppError('conflict', 'referral_milestone_threshold_exists', 409);
      }
      throw error;
    } finally {
      client.release();
    }
  });

  app.patch('/admin/referrals/milestones/:id', { preHandler: adminPreHandlers }, async (req) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = milestoneBody.safeParse(req.body);
    if (!body.success) throw new AppError('bad_request', 'invalid referral milestone', 400);
    const client = await app.pg.connect();
    try {
      await client.query('begin');
      const previous = await client.query(
        'select * from referral_milestone where id = $1 for update',
        [params.id],
      );
      if (!previous.rows[0]) throw new AppError('not_found', 'referral milestone not found', 404);
      await client.query(
        `update referral_milestone
            set qualified_referrals = $2, reward_stars = $3, sort_order = $2, updated_at = now()
          where id = $1`,
        [params.id, body.data.qualifiedReferrals, body.data.rewardStars],
      );
      const unlocked = await unlockMilestoneForEligibleInviters(client, params.id);
      await client.query(
        `insert into referral_milestone_audit
           (milestone_id, admin_user_id, action, before_value, after_value)
         values ($1, $2, 'updated', $3, $4)`,
        [params.id, req.user.id, JSON.stringify(previous.rows[0]), JSON.stringify(body.data)],
      );
      await client.query('commit');
      return { id: params.id, newlyUnlockedCount: unlocked };
    } catch (error) {
      await client.query('rollback');
      if ((error as { code?: string }).code === '23505') {
        throw new AppError('conflict', 'referral_milestone_threshold_exists', 409);
      }
      throw error;
    } finally {
      client.release();
    }
  });

  app.delete('/admin/referrals/milestones/:id', { preHandler: adminPreHandlers }, async (req) => {
    const params = z.object({ id: z.string().uuid() }).parse(req.params);
    const result = await app.pg.query(
      `update referral_milestone
          set archived_at = coalesce(archived_at, now()), updated_at = now()
        where id = $1 and archived_at is null
        returning to_jsonb(referral_milestone.*) as previous`,
      [params.id],
    );
    if (!result.rows[0]) throw new AppError('not_found', 'referral milestone not found', 404);
    await app.pg.query(
      `insert into referral_milestone_audit
         (milestone_id, admin_user_id, action, before_value)
       values ($1, $2, 'archived', $3)`,
      [params.id, req.user.id, JSON.stringify(result.rows[0].previous)],
    );
    return { ok: true };
  });
};
