import { apiFetch } from './apiFetch.js';

export type WeeklyChallengeTaskType =
  | 'goals_scored'
  | 'duels_played'
  | 'duels_won'
  | 'duel_invites_sent'
  | 'trainings_completed';

export type WeeklyChallengeStatus = 'future' | 'running' | 'finished';

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
  startAt: string;
  endAt: string;
  reward: { coins: number; stars: number; experience: number };
  rewardClaimedAt: string | null;
  tasks: WeeklyChallengeTask[];
  hasProgress: boolean;
  canClaimReward: boolean;
  allTasksCompleted: boolean;
  serverNow: string;
}

export interface WeeklyChallengeCurrentResponse {
  challenge: WeeklyChallenge | null;
  pendingRewards: WeeklyChallenge[];
}

export interface WeeklyChallengeCatalogResponse {
  future: WeeklyChallenge[];
  active: WeeklyChallenge[];
  completed: WeeklyChallenge[];
}

export interface WeeklyChallengeFailureResponse {
  challenge: WeeklyChallenge | null;
}

export function weeklyChallengeNeedsAction(
  challenge: Pick<WeeklyChallenge, 'canClaimReward'> | null | undefined,
): boolean {
  return challenge?.canClaimReward === true;
}

export function countClaimableWeeklyChallenges(
  challenges: Array<Pick<WeeklyChallenge, 'id' | 'canClaimReward'> | null | undefined>,
): number {
  const ids = new Set<string>();
  challenges.forEach((challenge) => {
    if (challenge !== null && challenge !== undefined && weeklyChallengeNeedsAction(challenge)) {
      ids.add(challenge.id);
    }
  });
  return ids.size;
}

export function fetchWeeklyChallenge(): Promise<WeeklyChallengeCurrentResponse> {
  return apiFetch<WeeklyChallengeCurrentResponse>('/weekly-challenge/current');
}

export function fetchWeeklyChallengeCatalog(): Promise<WeeklyChallengeCatalogResponse> {
  return apiFetch<WeeklyChallengeCatalogResponse>('/weekly-challenge/catalog');
}

export function fetchPendingWeeklyChallengeFailure(): Promise<WeeklyChallengeFailureResponse> {
  return apiFetch<WeeklyChallengeFailureResponse>('/weekly-challenge/failures/pending');
}

export function acknowledgeWeeklyChallengeFailure(
  id: string,
): Promise<WeeklyChallengeFailureResponse> {
  return apiFetch<WeeklyChallengeFailureResponse>(`/weekly-challenge/failures/${id}/acknowledge`, {
    method: 'POST',
  });
}

export function claimWeeklyChallengeReward(id: string): Promise<WeeklyChallengeCurrentResponse> {
  return apiFetch<WeeklyChallengeCurrentResponse>(`/weekly-challenge/${id}/claim-reward`, {
    method: 'POST',
  });
}
