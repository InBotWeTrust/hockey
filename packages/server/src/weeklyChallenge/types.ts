export const WEEKLY_CHALLENGE_TASK_TYPES = [
  'goals_scored',
  'duels_played',
  'duels_won',
  'duel_invites_sent',
  'trainings_completed',
] as const;

export type WeeklyChallengeTaskType = (typeof WEEKLY_CHALLENGE_TASK_TYPES)[number];
export type WeeklyChallengeStatus = 'not_open' | 'join_open' | 'running' | 'finished';

export interface WeeklyChallengeRow {
  id: string;
  title: string;
  description: string;
  join_open_at: Date;
  start_at: Date;
  end_at: Date;
  is_active: boolean;
  join_enabled: boolean;
  reward_coins: number;
  reward_stars: number;
  reward_experience: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface WeeklyChallengeTaskRow {
  id: string;
  challenge_id: string;
  type: WeeklyChallengeTaskType;
  title: string | null;
  target: number;
  sort_order: number;
  created_at: Date;
}

export interface WeeklyChallengeParticipantRow {
  id: string;
  challenge_id: string;
  user_id: string;
  joined_at: Date;
  reward_claimed_at: Date | null;
  created_at: Date;
}

export interface WeeklyChallengeDeclineRow {
  challenge_id: string;
  user_id: string;
  declined_at: Date;
}

export interface WeeklyChallengeTaskDTO {
  id: string;
  type: WeeklyChallengeTaskType;
  title: string;
  target: number;
  progress: number | null;
  completed: boolean | null;
}

export interface WeeklyChallengeDTO {
  id: string;
  title: string;
  description: string;
  status: WeeklyChallengeStatus;
  joinOpenAt: string;
  startAt: string;
  endAt: string;
  joinEnabled: boolean;
  reward: { coins: number; stars: number; experience: number };
  participant: { joinedAt: string; rewardClaimedAt: string | null } | null;
  declinedAt: string | null;
  tasks: WeeklyChallengeTaskDTO[];
  canJoin: boolean;
  canClaimReward: boolean;
  allTasksCompleted: boolean;
  serverNow: string;
}

export interface WeeklyChallengeCurrentResponse {
  challenge: WeeklyChallengeDTO | null;
  pendingRewards: WeeklyChallengeDTO[];
}
