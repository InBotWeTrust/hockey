import { apiFetch } from './apiFetch.js';

export type StatRatingMetric = 'goals' | 'accuracy' | 'streak';

export interface StatRatingPlayer {
  place: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  goals: number;
  shots: number;
  accuracy: number;
  currentStreakDays: number;
  recordStreakDays: number;
}

export interface StatRatingResponse {
  metric: StatRatingMetric;
  rows: StatRatingPlayer[];
  nextCursor: string | null;
  currentUser: StatRatingPlayer | null;
  eligibility: { eligible: boolean; goals?: number; requiredGoals?: number };
}

export function fetchStatRatingPage(metric: StatRatingMetric, cursor: string | null) {
  const query = new URLSearchParams({ limit: '30' });
  if (cursor !== null) query.set('cursor', cursor);
  return apiFetch<StatRatingResponse>(`/profile/ratings/${metric}?${query.toString()}`);
}
