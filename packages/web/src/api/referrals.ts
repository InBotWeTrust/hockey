import { apiFetch } from './apiFetch.js';

export type ReferralLevel = 'beginner' | 'amateur' | 'professional';

export interface ReferralMilestone {
  id: string;
  qualifiedReferrals: number;
  rewardStars: number;
  unlockId: string | null;
  unlockedAt: string | null;
  claimedAt: string | null;
}

export interface ReferralSummary {
  code: string;
  totalInvited: number;
  qualifiedInvited: number;
  counts: Record<ReferralLevel, number>;
  unclaimedRewardsCount: number;
  milestones: ReferralMilestone[];
}

export interface ReferralInvitee {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  experience: number;
  competitionLevel: ReferralLevel;
  joinedAt: string;
}

export const fetchReferralSummary = (): Promise<ReferralSummary> =>
  apiFetch<ReferralSummary>('/referrals/me');

export const fetchReferralInvitees = (level: ReferralLevel, offset = 0) =>
  apiFetch<{ items: ReferralInvitee[]; total: number }>(
    `/referrals/invitees?level=${level}&limit=20&offset=${offset}`,
  );

export const claimReferralReward = (unlockId: string) =>
  apiFetch<{ stars: number; awardedStars: number; alreadyClaimed: boolean }>(
    `/referrals/rewards/${unlockId}/claim`,
    { method: 'POST' },
  );

