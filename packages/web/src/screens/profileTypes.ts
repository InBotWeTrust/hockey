import type { RegularSeasonPodiumCongratulation } from '../api/tournament.js';

export type CompetitionLevel = 'beginner' | 'amateur' | 'professional';

export interface ProfileStats {
  shots: number;
  goals: number;
  accuracy: number;
  playStreakDays: number;
  bestPlayStreakDays?: number;
}

export interface ProfileAchievement {
  id: string;
  photoUrl: string;
  title: string;
  description: string;
  requirement: string;
  category?: string;
  availability?: 'active' | 'future' | 'hidden';
  futureTag?: string | null;
  rewardCurrency?: number;
  rewardStars?: number;
  rewardExperience?: number;
  status?: 'locked' | 'completed_unclaimed' | 'claimed';
  isUnlocked: boolean;
  isClaimable?: boolean;
  unlockedAt?: string;
  completedAt?: string;
  claimedAt?: string;
}

export interface ProfileData {
  id: string;
  registeredAt: string;
  displayName: string;
  role?: 'player' | 'admin';
  avatarUrl?: string | null;
  grip: 'right' | 'left';
  competitionLevel: CompetitionLevel;
  stats: ProfileStats;
  achievements: ProfileAchievement[];
  trophySummary?: {
    regularSeasonWins: number;
    tournamentChampionships: number;
    tournamentPodiums: number;
    completedChallenges: number;
  };
  unclaimedAchievementsCount?: number;
  currencyBalance?: number;
  starBalance?: number;
  experienceBalance?: number;
  registrationProvider?: 'telegram' | 'vk';
  registrationProviderId?: string;
  displaySource?: 'telegram' | 'vk' | 'custom';
  linkedProviders?: Array<'telegram' | 'vk'>;
  customDisplayName?: string | null;
  customFirstName?: string | null;
  customLastName?: string | null;
  customAvatarUrl?: string | null;
  tgId?: string;
  username?: string;
  tgFirstName?: string | null;
  tgLastName?: string | null;
  tgAvatarUrl?: string | null;
  tgUsername?: string | null;
  vkFirstName?: string | null;
  vkLastName?: string | null;
  vkAvatarUrl?: string | null;
  vkUsername?: string | null;
  pendingTournamentCongratulations?: RegularSeasonPodiumCongratulation[];
}
