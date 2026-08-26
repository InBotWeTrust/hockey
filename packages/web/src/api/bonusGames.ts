import { apiFetch } from './apiFetch.js';
import type { ShotInputPayload, ShotResultType } from './duel.js';

export type BonusGameCardState =
  | 'level_locked'
  | 'sequence_locked'
  | 'purchase_required'
  | 'available'
  | 'in_progress'
  | 'completed'
  | 'archived';

export type BonusAttemptStatus = 'active' | 'completed' | 'failed' | 'abandoned';
export type BonusAttemptState = 'idle' | 'period_active' | 'break_active' | 'closed';
export type BonusGoaliePattern = 'linear' | 'sine' | 'dash';
export type BonusSkillCode = 'speed' | 'accuracy';
export type BonusQualificationRules =
  | {
      type: 'goals_from_shots';
      targetGoals: number;
      shotsLimit: number;
      requiredGoalStreak?: number;
    }
  | {
      type: 'goals_in_time';
      targetGoals: number;
      activeTimeMs: number;
      requiredGoalStreak?: number;
    };

export interface BonusPeriodRule {
  period_number: number;
  duration_ms: number;
  shots_limit: number | null;
  goal_frequency: number;
  goalie_frequency: number;
  shooter_frequency: number;
  puck_speed_per_ms: number;
  goalie_pattern: BonusGoaliePattern;
  goalie_amplitude: number;
  goal_amplitude: number;
}

export interface BonusArena {
  id: string;
  slug: string;
  title: string;
  artwork_url: string;
  thumbnail_url: string;
}

export interface BonusReward {
  coins: number;
  stars: number;
  experience: number;
}

export interface BonusPeriodLoadoutSelection {
  stick?: string | null;
  skates?: string | null;
  nutrition?: string | null;
}

export interface BonusPeriodLoadout {
  items: Array<{
    id: string;
    itemId: string;
    instanceId: string | null;
    kind: 'stick' | 'skates' | 'nutrition';
    title: string;
    imageUrl: string | null;
    chargesConsumed: number;
    effects: {
      puckSpeedDelta: number;
      shooterFrequencyDelta: number;
      goalieFrequencyDelta: number;
      goalFrequencyDelta: number;
      shotZoneMultiplier: number;
      recoveryDelayMs: number;
    };
  }>;
}

export interface BonusGameCardAttempt {
  id: string;
  game_id: string;
  state: BonusAttemptState;
  current_period: number;
  period_started_at: string | null;
  break_started_at: string | null;
  shots_taken: number;
  goals: number;
}

export interface BonusGameCard {
  id: string;
  slug: string;
  title: string;
  skill_code: BonusSkillCode;
  description: string;
  sort_order: number;
  access_type: 'free' | 'paid';
  unlock_price_stars: number;
  target_goals: number;
  qualification_rules: BonusQualificationRules;
  total_periods: number;
  break_duration_ms: number;
  use_inventory: boolean;
  preview_title: string;
  preview_story: string;
  preview_artwork_url: string;
  preview_revision: number;
  period_rules: BonusPeriodRule[];
  reward: BonusReward;
  goalkeeper_ready_url: string;
  goalkeeper_save_url: string;
  arena: BonusArena;
  prerequisite: { game_id: string; title: string } | null;
  is_unlocked: boolean;
  is_completed: boolean;
  state: BonusGameCardState;
  active_attempt: BonusGameCardAttempt | null;
}

export interface BonusCatalogResponse {
  games: BonusGameCard[];
  active_attempt: BonusGameCardAttempt | null;
}

export interface BonusAttemptRules {
  game_id: string;
  slug: string;
  title: string;
  skill_code: BonusSkillCode;
  revision: number;
  target_goals: number;
  qualification_rules: BonusQualificationRules;
  total_periods: number;
  break_duration_ms: number;
  use_inventory: boolean;
  preview_title: string;
  preview_story: string;
  preview_artwork_url: string;
  preview_revision: number;
  periods: BonusPeriodRule[];
}

export interface BonusGameAttempt {
  id: string;
  game_id: string;
  game_slug: string;
  game_title: string;
  status: BonusAttemptStatus;
  state: BonusAttemptState;
  current_period: number;
  period_started_at: string | null;
  period_ends_at: string | null;
  break_started_at: string | null;
  break_ends_at: string | null;
  closed_at: string | null;
  shots_taken: number;
  current_period_shots_taken: number;
  goals: number;
  current_goal_streak: number;
  best_goal_streak: number;
  preview_required: boolean;
  current_loadout: BonusPeriodLoadout | null;
  reward_granted: boolean;
  attempt_seed: string;
  game_core_version: number;
  definition_revision: number;
  server_now: string;
  rules: BonusAttemptRules;
  reward: BonusReward;
  arena: BonusArena;
  goalkeeper_ready_url: string;
  goalkeeper_save_url: string;
}

export interface BonusAttemptResponse {
  attempt: BonusGameAttempt;
}

export interface BonusCurrentAttemptResponse {
  attempt: BonusGameAttempt | null;
}

export interface BonusUnlockResponse {
  unlocked: boolean;
  star_balance: number;
}

export interface BonusShotRequest {
  claimed_shot_index: number;
  input: ShotInputPayload;
  claimed_result: ShotResultType;
}

export interface BonusShotResponse {
  server_result: ShotResultType;
  attempt: BonusGameAttempt;
  reward_granted: boolean;
  balances: BonusReward;
}

function legacyQualificationRules(input: {
  target_goals: number;
  periods?: BonusPeriodRule[];
  period_rules?: BonusPeriodRule[];
}): BonusQualificationRules {
  const periods = input.periods ?? input.period_rules ?? [];
  return {
    type: 'goals_from_shots',
    targetGoals: input.target_goals,
    shotsLimit: periods.reduce((total, period) => total + (period.shots_limit ?? 0), 0),
  };
}

function normalizeBonusAttempt(attempt: BonusGameAttempt): BonusGameAttempt {
  const legacyAttempt = attempt as BonusGameAttempt & {
    current_goal_streak?: number;
    best_goal_streak?: number;
    preview_required?: boolean;
    current_loadout?: BonusPeriodLoadout | null;
  };
  const legacyRules = attempt.rules as BonusAttemptRules & {
    qualification_rules?: BonusQualificationRules;
    use_inventory?: boolean;
    preview_title?: string;
    preview_story?: string;
    preview_artwork_url?: string;
    preview_revision?: number;
  };
  return {
    ...attempt,
    current_goal_streak: legacyAttempt.current_goal_streak ?? 0,
    best_goal_streak: legacyAttempt.best_goal_streak ?? 0,
    preview_required: legacyAttempt.preview_required ?? false,
    current_loadout: legacyAttempt.current_loadout ?? null,
    rules: {
      ...attempt.rules,
      skill_code: legacyRules.skill_code ?? 'accuracy',
      qualification_rules:
        legacyRules.qualification_rules ?? legacyQualificationRules(attempt.rules),
      use_inventory: legacyRules.use_inventory ?? false,
      preview_title: legacyRules.preview_title ?? attempt.game_title,
      preview_story: legacyRules.preview_story ?? '',
      preview_artwork_url: legacyRules.preview_artwork_url ?? attempt.arena.artwork_url,
      preview_revision: legacyRules.preview_revision ?? 1,
    },
  };
}

function normalizeAttemptResponse(response: BonusAttemptResponse): BonusAttemptResponse {
  return { attempt: normalizeBonusAttempt(response.attempt) };
}

function normalizeCatalog(response: BonusCatalogResponse): BonusCatalogResponse {
  return {
    ...response,
    games: response.games.map((game) => ({
      ...game,
      skill_code: game.skill_code ?? 'accuracy',
      qualification_rules:
        game.qualification_rules ?? legacyQualificationRules({
          target_goals: game.target_goals,
          period_rules: game.period_rules,
        }),
      use_inventory: game.use_inventory ?? false,
      preview_title: game.preview_title ?? game.title,
      preview_story: game.preview_story ?? '',
      preview_artwork_url: game.preview_artwork_url ?? game.arena.artwork_url,
      preview_revision: game.preview_revision ?? 1,
    })),
  };
}

export const fetchBonusGames = (): Promise<BonusCatalogResponse> =>
  apiFetch<BonusCatalogResponse>('/bonus-games').then(normalizeCatalog);

export const fetchCurrentBonusAttempt = (): Promise<BonusCurrentAttemptResponse> =>
  apiFetch<BonusCurrentAttemptResponse>('/bonus-games/attempts/current').then((response) => ({
    attempt: response.attempt === null ? null : normalizeBonusAttempt(response.attempt),
  }));

export const fetchBonusAttempt = (attemptId: string): Promise<BonusAttemptResponse> =>
  apiFetch<BonusAttemptResponse>(`/bonus-games/attempts/${attemptId}`).then(normalizeAttemptResponse);

export const purchaseBonusGame = ({
  gameId,
  expectedPriceStars,
}: {
  gameId: string;
  expectedPriceStars: number;
}): Promise<BonusUnlockResponse> =>
  apiFetch<BonusUnlockResponse>(`/bonus-games/${gameId}/unlock`, {
    method: 'POST',
    body: JSON.stringify({ expected_price_stars: expectedPriceStars }),
  });

export const startBonusAttempt = (gameId: string): Promise<BonusAttemptResponse> =>
  apiFetch<BonusAttemptResponse>(`/bonus-games/${gameId}/attempts`, { method: 'POST' });

export const startBonusPeriod = (
  attemptId: string,
  loadout?: BonusPeriodLoadoutSelection,
): Promise<BonusAttemptResponse> =>
  apiFetch<BonusAttemptResponse>(`/bonus-games/attempts/${attemptId}/period/start`, {
    method: 'POST',
    body: JSON.stringify(loadout === undefined ? {} : { loadout }),
  }).then(normalizeAttemptResponse);

export const acknowledgeBonusPreview = (
  attemptId: string,
  dismissFuture: boolean,
): Promise<BonusAttemptResponse> =>
  apiFetch<BonusAttemptResponse>(`/bonus-games/attempts/${attemptId}/preview/acknowledge`, {
    method: 'POST',
    body: JSON.stringify({ dismiss_future: dismissFuture }),
  }).then(normalizeAttemptResponse);

export const submitBonusShot = (
  attemptId: string,
  body: BonusShotRequest,
): Promise<BonusShotResponse> =>
  apiFetch<BonusShotResponse>(`/bonus-games/attempts/${attemptId}/shot`, {
    method: 'POST',
    body: JSON.stringify(body),
  }).then((response) => ({ ...response, attempt: normalizeBonusAttempt(response.attempt) }));

export const abandonBonusAttempt = (attemptId: string): Promise<BonusAttemptResponse> =>
  apiFetch<BonusAttemptResponse>(`/bonus-games/attempts/${attemptId}/abandon`, {
    method: 'POST',
  }).then(normalizeAttemptResponse);
