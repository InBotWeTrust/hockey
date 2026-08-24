export type TournamentRegularSource = 'head_to_head' | 'daily_aggregate';
export type TournamentRegistrationMode = 'open' | 'approval' | 'invite_only';
export type TournamentVisibility = 'public' | 'hidden';
export type TournamentDailyMetric = 'goals_sum' | 'accuracy_average' | 'daily_place_points';
export type TournamentPlayoffSize = 2 | 4 | 8 | 16;

export type TournamentStatus =
  | 'draft'
  | 'registration'
  | 'registration_blocked'
  | 'scheduling'
  | 'regular'
  | 'playoff'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'archived';

interface TournamentConfigBase {
  participantLimit: number;
  playoffSize: TournamentPlayoffSize;
  timezone: string;
  registrationMode: TournamentRegistrationMode;
  visibility: TournamentVisibility;
  entryFeeCoins: number;
}

export interface HeadToHeadTournamentConfig extends TournamentConfigBase {
  regularSource: 'head_to_head';
  roundRobinCycles: number;
  roundsPerDay: number;
  firstRoundLocalTime: string;
  fixtureWindowMs: number;
  roundBreakMs: number;
  dailyDays: null;
  dailyMetric: null;
  bestDays: null;
}

export interface DailyAggregateTournamentConfig extends TournamentConfigBase {
  regularSource: 'daily_aggregate';
  roundRobinCycles: null;
  roundsPerDay: null;
  firstRoundLocalTime: null;
  fixtureWindowMs: null;
  roundBreakMs: null;
  dailyDays: number;
  dailyMetric: TournamentDailyMetric;
  bestDays: number | null;
}

export type TournamentConfig = HeadToHeadTournamentConfig | DailyAggregateTournamentConfig;

