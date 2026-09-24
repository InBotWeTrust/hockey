import { randomBytes } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';

type Queryable = Pool | PoolClient;

const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export type ReferralSource = 'manual' | 'link';

export function normalizeReferralCode(value: string): string {
  return value.trim().toUpperCase();
}

export function generateReferralCode(bytes = randomBytes(10)): string {
  let result = '';
  for (let index = 0; index < 10; index += 1) {
    result += REFERRAL_ALPHABET[bytes[index]! % REFERRAL_ALPHABET.length];
  }
  return result;
}

export async function ensureReferralCode(db: Queryable, userId: string): Promise<string> {
  const existing = await db.query<{ code: string }>(
    'select code from referral_code where user_id = $1',
    [userId],
  );
  if (existing.rows[0]) return existing.rows[0].code;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = generateReferralCode();
    const inserted = await db.query<{ code: string }>(
      `insert into referral_code (user_id, code)
       values ($1, $2)
       on conflict do nothing
       returning code`,
      [userId, code],
    );
    if (inserted.rows[0]) return inserted.rows[0].code;
    const concurrent = await db.query<{ code: string }>(
      'select code from referral_code where user_id = $1',
      [userId],
    );
    if (concurrent.rows[0]) return concurrent.rows[0].code;
  }
  throw new Error('referral_code_generation_exhausted');
}

export async function resolveReferralInviter(
  db: Queryable,
  rawCode: string,
): Promise<{ userId: string; code: string }> {
  const code = normalizeReferralCode(rawCode);
  const result = await db.query<{ user_id: string; code: string }>(
    `select user_id, code
       from referral_code
      where code = $1`,
    [code],
  );
  const row = result.rows[0];
  if (!row) throw new AppError('referral_code_invalid', 'referral_code_invalid', 400);
  return { userId: row.user_id, code: row.code };
}

export async function attachReferralRelationship(
  db: Queryable,
  input: {
    inviteeUserId: string;
    inviterUserId: string;
    code: string;
    source: ReferralSource;
    ipHash?: string;
    installationHash?: string;
  },
): Promise<void> {
  if (input.inviteeUserId === input.inviterUserId) {
    throw new AppError('bad_request', 'referral_code_self', 400);
  }
  await transaction(db, async (client) => {
    await client.query('delete from referral_risk_signal where expires_at <= now()');
    await client.query(
      `insert into referral_relationship
         (invitee_user_id, inviter_user_id, referral_code, source)
       values ($1, $2, $3, $4)`,
      [input.inviteeUserId, input.inviterUserId, input.code, input.source],
    );

    for (const [signalType, signalHash] of [
      ['ip', input.ipHash],
      ['installation', input.installationHash],
    ] as const) {
      if (!signalHash) continue;
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [
        `referral-risk:${signalType}:${signalHash}`,
      ]);
      await client.query(
        `insert into referral_risk_signal
           (relationship_invitee_user_id, signal_type, signal_hash)
         values ($1, $2, $3)`,
        [input.inviteeUserId, signalType, signalHash],
      );
      const velocity = await client.query<{ count: number }>(
        `select count(distinct relationship_invitee_user_id)::int as count
           from referral_risk_signal
          where signal_type = $1
            and signal_hash = $2
            and created_at >= now() - interval '24 hours'
            and expires_at > now()`,
        [signalType, signalHash],
      );
      if (Number(velocity.rows[0]?.count ?? 0) >= 4) {
        await client.query(
          `insert into referral_risk_signal
             (relationship_invitee_user_id, signal_type, signal_hash)
           values ($1, 'velocity', $2)`,
          [input.inviteeUserId, signalHash],
        );
      }
    }
  });
}

export async function cleanupExpiredReferralRiskSignals(db: Queryable): Promise<number> {
  const result = await db.query('delete from referral_risk_signal where expires_at <= now()');
  return result.rowCount ?? 0;
}

export async function ensureNewUserReferral(
  db: Queryable,
  input: {
    userId: string;
    referralCode?: string;
    referralSource?: ReferralSource;
    ipHash?: string;
    installationHash?: string;
  },
): Promise<string> {
  const inviter = input.referralCode
    ? await resolveReferralInviter(db, input.referralCode)
    : undefined;
  const code = await ensureReferralCode(db, input.userId);
  if (inviter) {
    await attachReferralRelationship(db, {
      inviteeUserId: input.userId,
      inviterUserId: inviter.userId,
      code: inviter.code,
      source: input.referralSource ?? 'manual',
      ...(input.ipHash ? { ipHash: input.ipHash } : {}),
      ...(input.installationHash ? { installationHash: input.installationHash } : {}),
    });
  }
  return code;
}

async function transaction<T>(db: Queryable, work: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!(db instanceof Pool)) return work(db);
  const client = await db.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function reconcileReferralQualification(
  db: Queryable,
  inviteeUserId: string,
): Promise<boolean> {
  return transaction(db, async (client) => {
    const result = await client.query<{
      inviter_user_id: string;
      qualified_at: Date | null;
      blocked_at: Date | null;
      level: number;
      lifetime_goals_total: number;
      unlock_goals_required: number;
    }>(
      `select relationship.inviter_user_id,
              relationship.qualified_at,
              invited.blocked_at,
              invited.level,
              invited.lifetime_goals_total,
              coalesce(
                (select (value #>> '{}')::int
                   from game_settings
                  where key = 'amateur.unlock_goals_required'),
                300
              ) as unlock_goals_required
         from referral_relationship relationship
         join users invited on invited.id = relationship.invitee_user_id
        where relationship.invitee_user_id = $1
        for update of relationship, invited`,
      [inviteeUserId],
    );
    const row = result.rows[0];
    if (
      !row ||
      row.qualified_at !== null ||
      row.blocked_at !== null ||
      (Number(row.level) < 2 &&
        Number(row.lifetime_goals_total) < Number(row.unlock_goals_required))
    ) {
      return false;
    }

    await client.query('select pg_advisory_xact_lock(hashtext($1))', [row.inviter_user_id]);

    await client.query(
      `update referral_relationship
          set qualified_at = now()
        where invitee_user_id = $1`,
      [inviteeUserId],
    );
    const countResult = await client.query<{ count: number }>(
      `select count(*)::int as count
         from referral_relationship relationship
         join users invited on invited.id = relationship.invitee_user_id
        where relationship.inviter_user_id = $1
          and relationship.qualified_at is not null
          and invited.blocked_at is null`,
      [row.inviter_user_id],
    );
    const qualifiedCount = Number(countResult.rows[0]?.count ?? 0);
    await client.query("select pg_advisory_xact_lock(hashtext('referral-milestones'))");
    await client.query(
      `insert into referral_reward_unlock
         (inviter_user_id, milestone_id, qualified_referrals_snapshot, reward_stars_snapshot)
       select $1, milestone.id, milestone.qualified_referrals, milestone.reward_stars
         from referral_milestone milestone
        where milestone.archived_at is null
          and milestone.qualified_referrals <= $2
       on conflict (inviter_user_id, milestone_id) do nothing`,
      [row.inviter_user_id, qualifiedCount],
    );
    return true;
  });
}

export interface ReferralClaimResult {
  stars: number;
  awardedStars: number;
  alreadyClaimed: boolean;
}

export type ReferralCompetitionLevel = 'beginner' | 'amateur' | 'professional';

export interface ReferralMilestoneDTO {
  id: string;
  qualifiedReferrals: number;
  rewardStars: number;
  unlockedAt: string | null;
  claimedAt: string | null;
  unlockId: string | null;
}

export interface ReferralSummaryDTO {
  code: string;
  totalInvited: number;
  qualifiedInvited: number;
  counts: Record<ReferralCompetitionLevel, number>;
  unclaimedRewardsCount: number;
  milestones: ReferralMilestoneDTO[];
}

export async function getReferralSummary(
  db: Queryable,
  userId: string,
): Promise<ReferralSummaryDTO> {
  const code = await ensureReferralCode(db, userId);
  const [countsResult, milestonesResult] = await Promise.all([
    db.query<{
      total: number;
      qualified: number;
      beginners: number;
      amateurs: number;
      professionals: number;
    }>(
      `with invited as (
         select relationship.qualified_at,
                case
                  when invited_user.level >= 3 then 'professional'
                  when invited_user.level >= 2
                    or invited_user.lifetime_goals_total >= coalesce(
                      (select (value #>> '{}')::int from game_settings
                        where key = 'amateur.unlock_goals_required'), 300)
                    then 'amateur'
                  else 'beginner'
                end as competition_level
           from referral_relationship relationship
           join users invited_user on invited_user.id = relationship.invitee_user_id
          where relationship.inviter_user_id = $1
       )
       select count(*)::int as total,
              count(*) filter (where qualified_at is not null)::int as qualified,
              count(*) filter (where competition_level = 'beginner')::int as beginners,
              count(*) filter (where competition_level = 'amateur')::int as amateurs,
              count(*) filter (where competition_level = 'professional')::int as professionals
         from invited`,
      [userId],
    ),
    db.query<{
      id: string;
      qualified_referrals: number;
      reward_stars: number;
      unlock_id: string | null;
      unlocked_at: Date | null;
      claimed_at: Date | null;
    }>(
      `select milestone.id,
              coalesce(unlock.qualified_referrals_snapshot, milestone.qualified_referrals)
                as qualified_referrals,
              coalesce(unlock.reward_stars_snapshot, milestone.reward_stars) as reward_stars,
              unlock.id as unlock_id,
              unlock.unlocked_at,
              unlock.claimed_at
         from referral_milestone milestone
         left join referral_reward_unlock unlock
           on unlock.milestone_id = milestone.id and unlock.inviter_user_id = $1
        where milestone.archived_at is null or unlock.id is not null
        order by qualified_referrals asc, milestone.sort_order asc`,
      [userId],
    ),
  ]);
  const counts = countsResult.rows[0] ?? {
    total: 0,
    qualified: 0,
    beginners: 0,
    amateurs: 0,
    professionals: 0,
  };
  const milestones = milestonesResult.rows.map((row) => ({
    id: row.id,
    qualifiedReferrals: Number(row.qualified_referrals),
    rewardStars: Number(row.reward_stars),
    unlockId: row.unlock_id,
    unlockedAt: row.unlocked_at?.toISOString() ?? null,
    claimedAt: row.claimed_at?.toISOString() ?? null,
  }));
  return {
    code,
    totalInvited: Number(counts.total),
    qualifiedInvited: Number(counts.qualified),
    counts: {
      beginner: Number(counts.beginners),
      amateur: Number(counts.amateurs),
      professional: Number(counts.professionals),
    },
    unclaimedRewardsCount: milestones.filter(
      (milestone) => milestone.unlockedAt !== null && milestone.claimedAt === null,
    ).length,
    milestones,
  };
}

export async function listReferralInvitees(
  db: Queryable,
  input: { inviterUserId: string; level: ReferralCompetitionLevel; limit: number; offset: number },
): Promise<{
  items: Array<{
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    experience: number;
    competitionLevel: ReferralCompetitionLevel;
    joinedAt: string;
  }>;
  total: number;
}> {
  const result = await db.query<{
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    experience: number;
    competition_level: ReferralCompetitionLevel;
    joined_at: Date;
    total_count: number;
  }>(
    `with invited as (
       select invited_user.id as user_id,
              invited_user.display_name,
              invited_user.avatar_url,
              invited_user.experience,
              relationship.joined_at,
              case
                when invited_user.level >= 3 then 'professional'
                when invited_user.level >= 2
                  or invited_user.lifetime_goals_total >= coalesce(
                    (select (value #>> '{}')::int from game_settings
                      where key = 'amateur.unlock_goals_required'), 300)
                  then 'amateur'
                else 'beginner'
              end as competition_level
         from referral_relationship relationship
         join users invited_user on invited_user.id = relationship.invitee_user_id
        where relationship.inviter_user_id = $1
     )
     select *, count(*) over()::int as total_count
       from invited
      where competition_level = $2
      order by joined_at desc, user_id
      limit $3 offset $4`,
    [input.inviterUserId, input.level, input.limit, input.offset],
  );
  return {
    items: result.rows.map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      experience: Number(row.experience),
      competitionLevel: row.competition_level,
      joinedAt: row.joined_at.toISOString(),
    })),
    total: Number(result.rows[0]?.total_count ?? 0),
  };
}

export async function claimReferralReward(
  db: Queryable,
  inviterUserId: string,
  unlockId: string,
): Promise<ReferralClaimResult> {
  return transaction(db, async (client) => {
    const unlockResult = await client.query<{
      reward_stars_snapshot: number;
      claimed_at: Date | null;
    }>(
      `select reward_stars_snapshot, claimed_at
         from referral_reward_unlock
        where id = $1 and inviter_user_id = $2
        for update`,
      [unlockId, inviterUserId],
    );
    const unlock = unlockResult.rows[0];
    if (!unlock) throw new AppError('not_found', 'referral_reward_not_found', 404);
    if (unlock.claimed_at !== null) {
      const balance = await client.query<{ xp: number }>('select xp from users where id = $1', [
        inviterUserId,
      ]);
      return {
        stars: Number(balance.rows[0]?.xp ?? 0),
        awardedStars: 0,
        alreadyClaimed: true,
      };
    }

    const rewardStars = Number(unlock.reward_stars_snapshot);
    const balance = await client.query<{ xp: number }>(
      `update users
          set xp = xp + $2
        where id = $1
        returning xp`,
      [inviterUserId, rewardStars],
    );
    const stars = Number(balance.rows[0]!.xp);
    const wallet = await client.query<{ balance: number; reserved_balance: number }>(
      `select balance, reserved_balance
         from user_currency_account
        where user_id = $1`,
      [inviterUserId],
    );
    const coins = wallet.rows[0] ?? { balance: 0, reserved_balance: 0 };
    await client.query(
      `insert into currency_ledger
         (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after, metadata)
       values ($1, 'referral_reward', 0, 0, $2, $3, $4)`,
      [
        inviterUserId,
        Number(coins.balance),
        Number(coins.reserved_balance),
        JSON.stringify({ unlockId, stars: rewardStars, title: 'Награда за приглашённых друзей' }),
      ],
    );
    await client.query(
      `update referral_reward_unlock
          set claimed_at = now(), stars_after = $3
        where id = $1 and inviter_user_id = $2`,
      [unlockId, inviterUserId, stars],
    );
    return { stars, awardedStars: rewardStars, alreadyClaimed: false };
  });
}
