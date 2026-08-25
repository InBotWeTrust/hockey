import { apiFetch } from './apiFetch.js';

export type AchievementStatus = 'locked' | 'completed_unclaimed' | 'claimed';
export type AchievementAvailability = 'active' | 'future' | 'hidden';

export interface AchievementDto {
  id: string;
  photoUrl: string;
  title: string;
  description: string;
  requirement: string;
  category: 'daily' | 'training' | 'duel' | 'tournament' | 'shop' | 'rating' | 'level';
  availability: AchievementAvailability;
  futureTag: string | null;
  rewardCurrency: number;
  rewardStars: number;
  rewardExperience: number;
  status: AchievementStatus;
  isUnlocked: boolean;
  isClaimable: boolean;
  completedAt?: string;
  claimedAt?: string;
}

export interface AchievementsResponse {
  achievements: AchievementDto[];
  unclaimedCount: number;
}

export interface ClaimAchievementResponse {
  achievement: AchievementDto;
  rewards: {
    currency: number;
    stars: number;
    experience: number;
  };
  balances: {
    currencyBalance: number;
    starBalance: number;
    experienceBalance: number;
  };
  unclaimedCount: number;
}

export const achievementKeys = {
  all: ['achievements'] as const,
};

export function fetchAchievements(): Promise<AchievementsResponse> {
  return apiFetch<AchievementsResponse>('/achievements');
}

export function claimAchievement(achievementId: string): Promise<ClaimAchievementResponse> {
  return apiFetch<ClaimAchievementResponse>(`/achievements/${achievementId}/claim`, {
    method: 'POST',
  });
}
