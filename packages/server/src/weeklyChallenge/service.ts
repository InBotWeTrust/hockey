import type { Pool, PoolClient } from 'pg';
import { appendEvent } from '../duel/eventLog.js';
import { AppError } from '../plugins/errors.js';
import { fetchWeeklyChallengeProgress } from './progress.js';
import { grantWeeklyChallengeReward } from './rewards.js';
import type {
  WeeklyChallengeCurrentResponse,
  WeeklyChallengeDTO,
  WeeklyChallengeParticipantRow,
  WeeklyChallengeRow,
  WeeklyChallengeStatus,
  WeeklyChallengeTaskRow,
} from './types.js';

type Queryable = Pool | PoolClient;

function iso(value: Date): string {
  return value.toISOString();
}

export function resolveWeeklyChallengeStatus(
  challenge: Pick<WeeklyChallengeRow, 'join_open_at' | 'start_at' | 'end_at'>,
  now: Date,
): WeeklyChallengeStatus {
  if (now < challenge.join_open_at) return 'not_open';
  if (now >= challenge.end_at) return 'finished';
  if (now >= challenge.start_at) return 'running';
  return 'join_open';
}

function defaultTaskTitle(task: WeeklyChallengeTaskRow): string {
  if (task.title?.trim()) return task.title.trim();
  if (task.type === 'goals_scored') return `Забросить ${task.target} шайб`;
  if (task.type === 'duels_played') return `Сыграть ${task.target} дуэлей`;
  if (task.type === 'duels_won') return `Победить в ${task.target} дуэлях`;
  if (task.type === 'duel_invites_sent') return `Пригласить ${task.target} соперников`;
  return `Завершить ${task.target} тренировок`;
}

async function fetchActiveChallenge(db: Queryable): Promise<WeeklyChallengeRow | null> {
  const { rows } = await db.query<WeeklyChallengeRow>(
    `select *
       from weekly_challenges
      where is_active
      order by start_at desc
      limit 1`,
  );
  return rows[0] ?? null;
}

async function fetchChallengeForUpdate(
  client: PoolClient,
  challengeId: string,
): Promise<WeeklyChallengeRow | null> {
  const { rows } = await client.query<WeeklyChallengeRow>(
    `select *
       from weekly_challenges
      where id = $1 and is_active
      for update`,
    [challengeId],
  );
  return rows[0] ?? null;
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

async function fetchParticipant(
  db: Queryable,
  challengeId: string,
  userId: string,
): Promise<WeeklyChallengeParticipantRow | null> {
  const { rows } = await db.query<WeeklyChallengeParticipantRow>(
    `select *
       from weekly_challenge_participants
      where challenge_id = $1 and user_id = $2`,
    [challengeId, userId],
  );
  return rows[0] ?? null;
}

async function mapChallenge(
  db: Queryable,
  challenge: WeeklyChallengeRow,
  userId: string,
  now: Date,
): Promise<WeeklyChallengeDTO> {
  const [tasks, participant] = await Promise.all([
    fetchTasks(db, challenge.id),
    fetchParticipant(db, challenge.id, userId),
  ]);
  const status = resolveWeeklyChallengeStatus(challenge, now);
  const progressFrom = participant !== null ? challenge.start_at : null;
  const progress =
    progressFrom !== null
      ? await fetchWeeklyChallengeProgress(db, {
          userId,
          from: progressFrom,
          to: challenge.end_at,
        })
      : null;
  const taskDtos = tasks.map((task) => {
    const value = progress ? progress[task.type] : null;
    return {
      id: task.id,
      type: task.type,
      title: defaultTaskTitle(task),
      target: task.target,
      progress: value,
      completed: value === null ? null : value >= task.target,
    };
  });
  const allTasksCompleted = taskDtos.length > 0 && taskDtos.every((task) => task.completed === true);
  const canJoin =
    participant === null &&
    challenge.join_enabled &&
    status !== 'not_open' &&
    status !== 'finished';
  const canClaimReward =
    participant !== null && participant.reward_claimed_at === null && allTasksCompleted;

  return {
    id: challenge.id,
    title: challenge.title,
    description: challenge.description,
    status,
    joinOpenAt: iso(challenge.join_open_at),
    startAt: iso(challenge.start_at),
    endAt: iso(challenge.end_at),
    joinEnabled: challenge.join_enabled,
    reward: {
      coins: Number(challenge.reward_coins),
      stars: Number(challenge.reward_stars),
      experience: Number(challenge.reward_experience),
    },
    participant:
      participant === null
        ? null
        : {
            joinedAt: iso(participant.joined_at),
            rewardClaimedAt: participant.reward_claimed_at?.toISOString() ?? null,
          },
    tasks: taskDtos,
    canJoin,
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
  const challenge = await fetchActiveChallenge(db);
  if (!challenge) return { challenge: null };
  return { challenge: await mapChallenge(db, challenge, userId, now) };
}

export async function joinWeeklyChallenge(
  client: PoolClient,
  challengeId: string,
  userId: string,
  now = new Date(),
): Promise<WeeklyChallengeCurrentResponse> {
  const challenge = await fetchChallengeForUpdate(client, challengeId);
  if (!challenge) throw new AppError('not_found', 'weekly challenge not found', 404);
  const status = resolveWeeklyChallengeStatus(challenge, now);
  if (!challenge.join_enabled || status === 'not_open' || status === 'finished') {
    throw new AppError('conflict', 'weekly challenge join is closed', 409);
  }

  await client.query(
    `insert into weekly_challenge_participants (challenge_id, user_id, joined_at)
     values ($1, $2, $3)
     on conflict (challenge_id, user_id) do nothing`,
    [challengeId, userId, now],
  );
  await appendEvent(client, userId, 'weekly_challenge_joined', { challenge_id: challengeId });
  return getCurrentWeeklyChallenge(client, userId, now);
}

export async function claimWeeklyChallengeReward(
  client: PoolClient,
  challengeId: string,
  userId: string,
  now = new Date(),
): Promise<WeeklyChallengeCurrentResponse> {
  const challenge = await fetchChallengeForUpdate(client, challengeId);
  if (!challenge) throw new AppError('not_found', 'weekly challenge not found', 404);
  const participant = await fetchParticipant(client, challengeId, userId);
  if (!participant) throw new AppError('conflict', 'weekly challenge participation required', 409);
  if (participant.reward_claimed_at !== null) {
    throw new AppError('conflict', 'weekly challenge reward already claimed', 409);
  }

  const mapped = await mapChallenge(client, challenge, userId, now);
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
