export interface BarPlayer {
  userId: string;
  name: string;
  avatarUrl: string | null;
  grip: 'left' | 'right';
  goals: number;
  shots?: number;
  shotsTaken?: number;
  shotsTotal?: number | null;
  state: string;
  period: number;
  until: string | null;
}
export interface BarMatch {
  format?: 'express' | 'express_plus' | 'classic' | null;
  totalPeriods?: number | null;
  id: string;
  kind: 'duel' | 'tournament';
  title: string | null;
  group: 'online' | 'upcoming' | 'finished';
  status: string;
  startsAt: string | null;
  expiresAt: string | null;
  players: [BarPlayer, BarPlayer];
}
export interface BarShot {
  id: string;
  userId: string;
  period: number;
  index: number;
  result: 'goal' | 'save' | 'miss';
  createdAt: string;
  shooterX: number;
  goalX: number;
  goalieX: number;
}
export interface BarBoard {
  totals?: { online: number; upcoming: number };
  online: BarMatch[];
  upcoming: BarMatch[];
  hasMore: boolean;
  page: number;
}
export interface BarLive {
  motion?: BarMotion[];
  playbackId: string | null;
  complete?: boolean;
  match: BarMatch | null;
  shots: BarShot[];
}

export interface BarMotionFrame {
  offsetMs: number;
  shooterX: number;
  goalOffsetX: number;
  goalieX: number;
  goalieY: number;
}
export interface BarMotion {
  userId: string;
  period: number;
  sampledAt: string;
  frames: BarMotionFrame[];
}
