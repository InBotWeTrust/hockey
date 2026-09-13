import { apiFetch } from './apiFetch.js';

export interface ExperienceRatingPlayer {
  place: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  experience: number;
}

export interface ExperienceRatingResponse {
  rows: ExperienceRatingPlayer[];
  nextCursor: string | null;
  currentUser: ExperienceRatingPlayer;
}

export function fetchExperienceRatingPage(cursor: string | null): Promise<ExperienceRatingResponse> {
  const query = new URLSearchParams({ limit: '30' });
  if (cursor !== null) query.set('cursor', cursor);
  return apiFetch<ExperienceRatingResponse>(`/profile/experience-rating?${query.toString()}`);
}
