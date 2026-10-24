import type { Pool, PoolClient } from 'pg';
import { appendEvent } from '../duel/eventLog.js';
import { AppError } from '../plugins/errors.js';
import { resolveAmateurAccess } from '../profile/amateurAccess.js';
import { fetchWeeklyChallengeProgress, fetchWeeklyChallengeProgressBatch, type WeeklyChallengeProgressMap } from './progress.js';
import { grantWeeklyChallengeReward } from './rewards.js';
import type {
  WeeklyChallengeCatalogResponse,
  WeeklyChallengeCurrentResponse,
  WeeklyChallengeDTO,
  WeeklyChallengeFailureResponse,
  WeeklyChallengeStartResponse,
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
  if (task.type === 'channel_posts_commented')
    return `Прокомментировать ${task.target} постов канала`;
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

interface ChallengeReadData {
  tasks: WeeklyChallengeTaskRow[];
  rewardClaimedAt: Date | null;
  progress: WeeklyChallengeProgressMap;
  eligible: boolean;
}

async function mapChallenge(
  db: Queryable,
  challenge: WeeklyChallengeRow,
  userId: string,
  now: Date,
  loaded?: ChallengeReadData,
): Promise<WeeklyChallengeDTO> {
  const tasks = loaded?.tasks ?? await fetchTasks(db, challenge.id);
  const rewardClaimedAt = loaded ? loaded.rewardClaimedAt : (await fetchRewardClaim(db, challenge.id, userId))?.claimed_at ?? null;
  const status = resolveWeeklyChallengeStatus(challenge, now);
  const progress = loaded?.progress ?? await fetchWeeklyChallengeProgress(db, {
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
    (loaded ? loaded.eligible : await hasChallengeEligibility(db, challenge, userId));

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
      tokens: Number(challenge.reward_tokens),
    },
    rewardClaimedAt: rewardClaimedAt?.toISOString() ?? null,
    tasks: taskDtos,
    hasProgress,
    canClaimReward,
    allTasksCompleted,
    serverNow: iso(now),
  };
}

/** Bound SQL parameter/work batches without changing catalogue or reward contracts. */
async function mapChallenges(db: Queryable, challenges: WeeklyChallengeRow[], userId: string, now: Date): Promise<WeeklyChallengeDTO[]> {
  if (challenges.length <= 1) return Promise.all(challenges.map(challenge => mapChallenge(db, challenge, userId, now)));
  const result: WeeklyChallengeDTO[] = [];
  for (let offset = 0; offset < challenges.length; offset += 50) {
    const batch = challenges.slice(offset, offset + 50);
    const ids = batch.map(challenge => challenge.id);
    const tasks = await db.query<WeeklyChallengeTaskRow>(
      `select * from weekly_challenge_tasks where challenge_id = any($1::uuid[])
       order by challenge_id, sort_order asc, created_at asc`, [ids]);
    const claims = await db.query<{challenge_id: string; claimed_at: Date}>(
      'select challenge_id, claimed_at from weekly_challenge_reward_claims where challenge_id = any($1::uuid[]) and user_id = $2', [ids,userId]);
    const participants = await db.query<{challenge_id: string}>(
      'select challenge_id from weekly_challenge_participants where challenge_id = any($1::uuid[]) and user_id = $2', [ids,userId]);
    const progress = await fetchWeeklyChallengeProgressBatch(db,userId,batch.map(challenge=>({from:challenge.start_at,to:challenge.end_at})));
    const grouped = new Map<string, WeeklyChallengeTaskRow[]>();
    for (const task of tasks.rows) {
      const group = grouped.get(task.challenge_id) ?? [];
      group.push(task);
      grouped.set(task.challenge_id,group);
    }
    const claimed = new Map(claims.rows.map(claim=>[claim.challenge_id,claim.claimed_at]));
    const joined = new Set(participants.rows.map(row=>row.challenge_id));
    for (const [index, challenge] of batch.entries()) {
      const values = progress[index];
      if (!values) throw new Error('Missing weekly challenge progress window');
      result.push(await mapChallenge(db,challenge,userId,now,{
        tasks:grouped.get(challenge.id) ?? [], rewardClaimedAt:claimed.get(challenge.id) ?? null,
        progress:values, eligible:challenge.is_automatic ? challenge.launched_at !== null : joined.has(challenge.id),
      }));
    }
  }
  return result;
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
  const mapped = await mapChallenges(db, [...pendingRewardCandidates, ...(challenge ? [challenge] : [])], userId, now);
  const pendingRewards = mapped.slice(0,pendingRewardCandidates.length).filter(candidate=>candidate.canClaimReward);
  return { challenge: challenge ? mapped.at(-1)! : null, pendingRewards };
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
  for (const challenge of await mapChallenges(db, candidates, userId, now)) {
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
  for (let offset = 0; offset < rows.length; offset += 50) {
    const mapped = await mapChallenges(db, rows.slice(offset, offset + 50), userId, now);
    const challenge = mapped.find(item => item.rewardClaimedAt === null && item.hasProgress && !item.allTasksCompleted);
    if (challenge) return { challenge };
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

export async function getPendingWeeklyChallengeStart(
  db: Queryable,
  userId: string,
  now = new Date(),
): Promise<WeeklyChallengeStartResponse> {
  if (!(await resolveAmateurAccess(db, userId)).hasFullAccess) return { challenge: null };
  const challenge = await fetchActiveChallenge(db, now);
  if (challenge === null || !challenge.is_automatic || challenge.launched_at === null) {
    return { challenge: null };
  }
  const acknowledged = await db.query(
    `select 1 from weekly_challenge_start_acknowledgements
      where challenge_id = $1 and user_id = $2`,
    [challenge.id, userId],
  );
  if (acknowledged.rowCount !== 0) return { challenge: null };
  return { challenge: await mapChallenge(db, challenge, userId, now) };
}

export async function acknowledgeWeeklyChallengeStart(
  client: PoolClient,
  challengeId: string,
  userId: string,
  now = new Date(),
): Promise<WeeklyChallengeStartResponse> {
  if (!(await resolveAmateurAccess(client, userId)).hasFullAccess) {
    throw new AppError('amateur_level_required', 'weekly challenges are locked', 403);
  }
  const challenge = await fetchChallengeForRewardUpdate(client, challengeId);
  if (
    challenge === null ||
    !challenge.is_active ||
    !challenge.is_automatic ||
    challenge.launched_at === null ||
    resolveWeeklyChallengeStatus(challenge, now) !== 'running'
  ) {
    throw new AppError('conflict', 'weekly challenge start is not available', 409);
  }
  await client.query(
    `insert into weekly_challenge_start_acknowledgements
       (challenge_id, user_id, acknowledged_at)
     values ($1, $2, $3)
     on conflict (challenge_id, user_id) do nothing`,
    [challengeId, userId, now],
  );
  return { challenge: null };
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
    tokens: Number(challenge.reward_tokens),
  });
  await appendEvent(client, userId, 'weekly_challenge_reward_claimed', {
    challenge_id: challengeId,
    coins: Number(challenge.reward_coins),
    stars: Number(challenge.reward_stars),
    experience: Number(challenge.reward_experience),
    tokens: Number(challenge.reward_tokens),
  });
  return getCurrentWeeklyChallenge(client, userId, now);
}
