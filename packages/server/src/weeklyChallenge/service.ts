import type { Pool, PoolClient } from 'pg';
import { appendEvent } from '../duel/eventLog.js';
import { AppError } from '../plugins/errors.js';
import { fetchWeeklyChallengeProgress } from './progress.js';
import { grantWeeklyChallengeReward } from './rewards.js';
import type {
  WeeklyChallengeCatalogResponse,
  WeeklyChallengeCurrentResponse,
  WeeklyChallengeDTO,
  WeeklyChallengeFailureResponse,
  WeeklyChallengeRow,
  WeeklyChallengeStatus,
  WeeklyChallengeTaskRow,
} from './types.js';
import { classifyWeeklyChallengeForCatalog } from './types.js';

type Queryable = Pool | PoolClient;

function iso(value: Date): string {
  return value.toISOString();
}

export function resolveWeeklyChallengeStatus(
  challenge: Pick<WeeklyChallengeRow, 'start_at' | 'end_at'>,
  now: Date,
): WeeklyChallengeStatus {
  if (now >= challenge.end_at) return 'finished';
  if (now >= challenge.start_at) return 'running';
  return 'future';
}

function defaultTaskTitle(task: WeeklyChallengeTaskRow): string {
  if (task.title?.trim()) return task.title.trim();
  if (task.type === 'goals_scored') return `Забросить ${task.target} шайб`;
  if (task.type === 'duels_played') return `Сыграть ${task.target} дуэлей`;
  if (task.type === 'duels_won') return `Победить в ${task.target} дуэлях`;
  if (task.type === 'duel_invites_sent') return `Пригласить ${task.target} соперников`;
  return `Завершить ${task.target} тренировок`;
}

async function fetchActiveChallenge(db: Queryable, now: Date): Promise<WeeklyChallengeRow | null> {
  const { rows } = await db.query<WeeklyChallengeRow>(
    `select *
       from weekly_challenges
      where is_active
        and (not is_automatic or launched_at is not null)
        and start_at <= $1
        and $1 < end_at
      order by start_at desc
      limit 1`,
    [now],
  );
  return rows[0] ?? null;
}

async function fetchCatalogChallenges(
  db: Queryable,
  userId: string,
  now: Date,
): Promise<WeeklyChallengeRow[]> {
  const { rows } = await db.query<WeeklyChallengeRow>(
    `select challenge.*
       from weekly_challenges challenge
      cross join weekly_challenge_settings settings
      where (challenge.end_at <= $1 and (
              (challenge.is_automatic and challenge.launched_at is not null)
              or (not challenge.is_automatic and (
                exists (select 1 from weekly_challenge_participants p where p.challenge_id = challenge.id and p.user_id = $2)
                or exists (select 1 from weekly_challenge_reward_claims rc where rc.challenge_id = challenge.id and rc.user_id = $2)
              ))
            ))
         or (
              challenge.is_active
              and (not challenge.is_automatic or challenge.launched_at is not null)
              and challenge.start_at <= $1
              and $1 < challenge.end_at
            )
         or (
              settings.enabled
              and challenge.visible_from <= $1
              and $1 < challenge.start_at
            )
      order by challenge.start_at desc, challenge.id`,
    [now, userId],
  );
  return rows;
}

async function fetchChallengeForRewardUpdate(
  client: PoolClient,
  challengeId: string,
): Promise<WeeklyChallengeRow | null> {
  const { rows } = await client.query<WeeklyChallengeRow>(
    `select *
       from weekly_challenges
      where id = $1
      for update`,
    [challengeId],
  );
  return rows[0] ?? null;
}

async function fetchPendingRewardChallenges(
  db: Queryable,
  userId: string,
  currentChallengeId: string | null,
  now: Date,
): Promise<WeeklyChallengeRow[]> {
  const { rows } = await db.query<WeeklyChallengeRow>(
    `select c.*
       from weekly_challenges c
       left join weekly_challenge_reward_claims rc
         on rc.challenge_id = c.id and rc.user_id = $1
      where rc.id is null
        and c.end_at <= $2
        and ((c.is_automatic and c.launched_at is not null)
          or (not c.is_automatic and exists (
            select 1 from weekly_challenge_participants p where p.challenge_id = c.id and p.user_id = $1
          )))
        and ($3::uuid is null or c.id <> $3::uuid)
      order by c.end_at desc, c.start_at desc`,
    [userId, now, currentChallengeId],
  );
  return rows;
}

async function fetchTasks(db: Queryable, challengeId: string): Promise<WeeklyChallengeTaskRow[]> {
  const { rows } = await db.query<WeeklyChallengeTaskRow>(
    `select *
       from weekly_challenge_tasks
      where challenge_id = $1
      order by sort_order asc, created_at asc`,
    [challengeId],
  );
  return rows;
}

async function fetchRewardClaim(
  db: Queryable,
  challengeId: string,
  userId: string,
): Promise<{ claimed_at: Date } | null> {
  const { rows } = await db.query<{ claimed_at: Date }>(
    `select claimed_at
       from weekly_challenge_reward_claims
      where challenge_id = $1 and user_id = $2`,
    [challengeId, userId],
  );
  return rows[0] ?? null;
}

async function hasChallengeEligibility(
  db: Queryable,
  challenge: WeeklyChallengeRow,
  userId: string,
): Promise<boolean> {
  if (challenge.is_automatic) return challenge.launched_at !== null;
  const { rows } = await db.query(
    `select 1 from weekly_challenge_participants where challenge_id = $1 and user_id = $2`,
    [challenge.id, userId],
  );
  return rows.length > 0;
}

async function mapChallenge(
  db: Queryable,
  challenge: WeeklyChallengeRow,
  userId: string,
  now: Date,
): Promise<WeeklyChallengeDTO> {
  const tasks = await fetchTasks(db, challenge.id);
  const rewardClaim = await fetchRewardClaim(db, challenge.id, userId);
  const rewardClaimedAt = rewardClaim?.claimed_at ?? null;
  const status = resolveWeeklyChallengeStatus(challenge, now);
  const progress = await fetchWeeklyChallengeProgress(db, {
    userId,
    from: challenge.start_at,
    to: challenge.end_at,
  });
  const taskDtos = tasks.map((task) => {
    const value = progress[task.type];
    return {
      id: task.id,
      type: task.type,
      title: defaultTaskTitle(task),
      target: task.target,
      progress: value,
      completed: value >= task.target,
    };
  });
  const allTasksCompleted =
    taskDtos.length > 0 && taskDtos.every((task) => task.completed === true);
  const hasProgress = taskDtos.some((task) => task.progress > 0);
  const canClaimReward =
    rewardClaimedAt === null &&
    allTasksCompleted &&
    (await hasChallengeEligibility(db, challenge, userId));

  return {
    id: challenge.id,
    title: challenge.title,
    description: challenge.description,
    status,
    startAt: iso(challenge.start_at),
    endAt: iso(challenge.end_at),
    reward: {
      coins: Number(challenge.reward_coins),
      stars: Number(challenge.reward_stars),
      experience: Number(challenge.reward_experience),
    },
    rewardClaimedAt: rewardClaimedAt?.toISOString() ?? null,
    tasks: taskDtos,
    hasProgress,
    canClaimReward,
    allTasksCompleted,
    serverNow: iso(now),
  };
}

export async function getCurrentWeeklyChallenge(
  db: Queryable,
  userId: string,
  now = new Date(),
): Promise<WeeklyChallengeCurrentResponse> {
  const challenge = await fetchActiveChallenge(db, now);
  const pendingRewardCandidates = await fetchPendingRewardChallenges(
    db,
    userId,
    challenge?.id ?? null,
    now,
  );
  const pendingRewards = [];
  for (const candidate of pendingRewardCandidates) {
    const mapped = await mapChallenge(db, candidate, userId, now);
    if (mapped.canClaimReward) pendingRewards.push(mapped);
  }
  if (!challenge) return { challenge: null, pendingRewards };
  return { challenge: await mapChallenge(db, challenge, userId, now), pendingRewards };
}

export async function getWeeklyChallengeCatalog(
  db: Queryable,
  userId: string,
  now = new Date(),
): Promise<WeeklyChallengeCatalogResponse> {
  const response: WeeklyChallengeCatalogResponse = {
    future: [],
    active: [],
    completed: [],
  };
  const candidates = await fetchCatalogChallenges(db, userId, now);
  for (const candidate of candidates) {
    const challenge = await mapChallenge(db, candidate, userId, now);
    const section = classifyWeeklyChallengeForCatalog(challenge);
    if (section !== null) response[section].push(challenge);
  }
  response.future.sort((left, right) => left.startAt.localeCompare(right.startAt));
  response.active.sort((left, right) => left.endAt.localeCompare(right.endAt));
  response.completed.sort((left, right) => right.endAt.localeCompare(left.endAt));
  return response;
}

export async function getPendingWeeklyChallengeFailure(
  db: Queryable,
  userId: string,
  now = new Date(),
): Promise<WeeklyChallengeFailureResponse> {
  const { rows } = await db.query<WeeklyChallengeRow>(
    `select challenge.*
       from weekly_challenges challenge
       left join weekly_challenge_failure_acknowledgements acknowledgement
         on acknowledgement.challenge_id = challenge.id and acknowledgement.user_id = $1
      where challenge.end_at <= $2
        and ((challenge.is_automatic and challenge.launched_at is not null)
          or (not challenge.is_automatic and exists (
            select 1 from weekly_challenge_participants p where p.challenge_id = challenge.id and p.user_id = $1
          )))
        and acknowledgement.challenge_id is null
      order by challenge.end_at asc, challenge.id asc`,
    [userId, now],
  );
  for (const row of rows) {
    const challenge = await mapChallenge(db, row, userId, now);
    if (challenge.rewardClaimedAt === null && challenge.hasProgress && !challenge.allTasksCompleted)
      return { challenge };
  }
  return { challenge: null };
}

export async function acknowledgeWeeklyChallengeFailure(
  client: PoolClient,
  challengeId: string,
  userId: string,
  now = new Date(),
): Promise<WeeklyChallengeFailureResponse> {
  const challenge = await fetchChallengeForRewardUpdate(client, challengeId);
  if (challenge === null) throw new AppError('not_found', 'weekly challenge not found', 404);
  if (!(await hasChallengeEligibility(client, challenge, userId))) {
    throw new AppError('conflict', 'weekly challenge is not available for this player', 409);
  }
  const mapped = await mapChallenge(client, challenge, userId, now);
  if (
    mapped.status !== 'finished' ||
    !mapped.hasProgress ||
    mapped.allTasksCompleted ||
    mapped.rewardClaimedAt !== null
  ) {
    throw new AppError('conflict', 'weekly challenge failure is not available', 409);
  }
  await client.query(
    `insert into weekly_challenge_failure_acknowledgements
       (challenge_id, user_id, acknowledged_at)
     values ($1, $2, $3)
     on conflict (challenge_id, user_id) do nothing`,
    [challengeId, userId, now],
  );
  return getPendingWeeklyChallengeFailure(client, userId, now);
}

export async function claimWeeklyChallengeReward(
  client: PoolClient,
  challengeId: string,
  userId: string,
  now = new Date(),
): Promise<WeeklyChallengeCurrentResponse> {
  const challenge = await fetchChallengeForRewardUpdate(client, challengeId);
  if (!challenge) throw new AppError('not_found', 'weekly challenge not found', 404);
  if ((await fetchRewardClaim(client, challengeId, userId)) !== null) {
    throw new AppError('conflict', 'weekly challenge reward already claimed', 409);
  }
  if (!(await hasChallengeEligibility(client, challenge, userId))) {
    throw new AppError('conflict', 'weekly challenge is not available for this player', 409);
  }
  const status = resolveWeeklyChallengeStatus(challenge, now);
  if (status === 'future' || (status === 'running' && !challenge.is_active)) {
    throw new AppError('conflict', 'weekly challenge is not active', 409);
  }
  const mapped = await mapChallenge(client, challenge, userId, now);
  if (mapped.rewardClaimedAt !== null) {
    throw new AppError('conflict', 'weekly challenge reward already claimed', 409);
  }
  if (!mapped.allTasksCompleted) {
    throw new AppError('conflict', 'weekly challenge tasks are incomplete', 409);
  }

  await grantWeeklyChallengeReward(client, {
    challengeId,
    userId,
    coins: Number(challenge.reward_coins),
    stars: Number(challenge.reward_stars),
    experience: Number(challenge.reward_experience),
  });
  await appendEvent(client, userId, 'weekly_challenge_reward_claimed', {
    challenge_id: challengeId,
    coins: Number(challenge.reward_coins),
    stars: Number(challenge.reward_stars),
    experience: Number(challenge.reward_experience),
  });
  return getCurrentWeeklyChallenge(client, userId, now);
}
