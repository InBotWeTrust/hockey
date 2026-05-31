import { apiFetch } from './apiFetch.js';

export type WeeklyChallengeTaskType =
  | 'goals_scored'
  | 'duels_played'
  | 'duels_won'
  | 'duel_invites_sent'
  | 'trainings_completed';

export type WeeklyChallengeStatus = 'not_open' | 'join_open' | 'running' | 'finished';

export interface WeeklyChallengeTask {
  id: string;
  type: WeeklyChallengeTaskType;
  title: string;
  target: number;
  progress: number | null;
  completed: boolean | null;
}

export interface WeeklyChallenge {
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
  tasks: WeeklyChallengeTask[];
  canJoin: boolean;
  canClaimReward: boolean;
  allTasksCompleted: boolean;
  serverNow: string;
}

export interface WeeklyChallengeCurrentResponse {
  challenge: WeeklyChallenge | null;
}

export function fetchWeeklyChallenge(): Promise<WeeklyChallengeCurrentResponse> {
  return apiFetch<WeeklyChallengeCurrentResponse>('/weekly-challenge/current');
}

export function joinWeeklyChallenge(id: string): Promise<WeeklyChallengeCurrentResponse> {
  return apiFetch<WeeklyChallengeCurrentResponse>(`/weekly-challenge/${id}/join`, {
    method: 'POST',
  });
}

export function claimWeeklyChallengeReward(id: string): Promise<WeeklyChallengeCurrentResponse> {
  return apiFetch<WeeklyChallengeCurrentResponse>(`/weekly-challenge/${id}/claim-reward`, {
    method: 'POST',
  });
}
