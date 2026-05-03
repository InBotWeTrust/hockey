export type CompetitionLevel = 'beginner' | 'amateur' | 'professional';

export interface ProfileStats {
  shots: number;
  goals: number;
  accuracy: number;
  playStreakDays: number;
}

export interface ProfileAchievement {
  id: string;
  photoUrl: string;
  title: string;
  description: string;
  requirement: string;
  isUnlocked: boolean;
  unlockedAt?: string;
}

export interface ProfileData {
  id: string;
  displayName: string;
  role?: 'player' | 'admin';
  avatarUrl?: string | null;
  grip: 'right' | 'left';
  competitionLevel: CompetitionLevel;
  stats: ProfileStats;
  achievements: ProfileAchievement[];
  displaySource?: 'telegram' | 'vk';
  linkedProviders?: Array<'telegram' | 'vk'>;
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
}
