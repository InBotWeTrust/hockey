import React from 'react';
import { DEFAULT_MARKSMANSHIP_SCORING_RULES } from '@hockey/game-core';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BonusRecordsModal } from './src/profile/BonusRecordsModal';
import { BonusResult } from './src/screens/BonusGamePlayScreen';
import type { BonusGameAttempt } from './src/api/bonusGames';
import './src/app/global.css';
import './src/app/design-system.css';
function fixtureAttempt(): BonusGameAttempt {
  return {
    id: 'attempt-1',
    game_id: 'game-1',
    game_slug: 'beach',
    game_title: 'Пляж',
    status: 'active',
    state: 'period_active',
    current_period: 2,
    period_started_at: '2026-08-24T10:00:00.000Z',
    period_ends_at: '2026-08-24T10:04:00.000Z',
    break_started_at: null,
    break_ends_at: null,
    goal_window_started_at: null,
    goal_window_ends_at: null,
    closed_at: null,
    shots_taken: 28,
    current_period_shots_taken: 3,
    goals: 18,
    total_points: 0,
    current_goal_streak: 2,
    best_goal_streak: 4,
    preview_required: false,
    current_loadout: null,
    reward_granted: false,
    attempt_seed: 'bonus-seed',
    game_core_version: 1,
    definition_revision: 4,
    server_now: '2026-08-24T10:00:09.000Z',
    rules: {
      game_id: 'game-1',
      slug: 'beach',
      title: 'Пляж',
      skill_code: 'accuracy',
      revision: 4,
      target_goals: 20,
      qualification_rules: { type: 'goals_from_shots', targetGoals: 20, shotsLimit: 50 },
      total_periods: 2,
      break_duration_ms: 30_000,
      use_inventory: false,
      preview_title: 'Первая квалификация',
      preview_story: 'История',
      preview_artwork_url: '/bonus-games/location-cards/beach.webp',
      preview_revision: 1,
      periods: [
        {
          period_number: 1,
          duration_ms: 240_000,
          shots_limit: 25,
          goal_frequency: 0.45,
          goalie_frequency: 0.5,
          shooter_frequency: 0.65,
          puck_speed_per_ms: 1.2,
          goalie_pattern: 'linear',
          goalie_amplitude: 1,
          goal_amplitude: 220,
        },
        {
          period_number: 2,
          duration_ms: 240_000,
          shots_limit: 25,
          goal_frequency: 0.5,
          goalie_frequency: 0.55,
          shooter_frequency: 0.7,
          puck_speed_per_ms: 1.3,
          goalie_pattern: 'sine',
          goalie_amplitude: 0.9,
          goal_amplitude: 200,
        },
      ],
    },
    reward: { coins: 100, stars: 1, experience: 50 },
    arena: {
      id: 'arena-1',
      slug: 'beach',
      title: 'Пляж',
      artwork_url: '/bonus-games/arenas/beach.webp',
      thumbnail_url: '/bonus-games/arenas/beach.webp',
    },
    goalkeeper_ready_url: '/bonus-games/goalkeepers/beach-ready.webp',
    goalkeeper_save_url: '/bonus-games/goalkeepers/beach-save.webp',
  };
}
const params = new URLSearchParams(window.location.search);
const skill = params.get('skill') ?? 'speed';
const rows = Array.from({ length: 100 }, (_, i) => ({
  place: i + 1,
  userId: `fixture-${i}`,
  displayName: `Игрок ${i + 1}`,
  avatarUrl: null,
  elapsedMs: skill === 'endurance' ? 180000 : 130000 + i * 800,
  shots: skill === 'endurance' ? 100 + i : 20 + Math.floor(i / 4),
  goals: skill === 'endurance' ? 50 - Math.floor(i / 4) : 20,
  points: 0,
}));
const own = {
  ...rows[0],
  userId: 'me',
  displayName: 'Очень длинное имя пользователя для проверки многоточия',
  place: 121,
  elapsedMs: skill === 'endurance' ? 180000 : 300000,
  shots: skill === 'endurance' ? 100 : 47,
  goals: skill === 'endurance' ? 10 : 20,
};
const nativeFetch = window.fetch.bind(window);
window.fetch = (url, init) =>
  String(url).includes('/records?')
    ? Promise.resolve(
        new Response(
          JSON.stringify({
            rows: rows.slice(
              Number(new URL(String(url), window.location.origin).searchParams.get('offset') ?? 0),
              Number(new URL(String(url), window.location.origin).searchParams.get('offset') ?? 0) +
                20,
            ),
            currentUser: own,
            skillCode: skill,
            nextOffset:
              Number(new URL(String(url), window.location.origin).searchParams.get('offset') ?? 0) <
              80
                ? Number(
                    new URL(String(url), window.location.origin).searchParams.get('offset') ?? 0,
                  ) + 20
                : null,
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      )
    : nativeFetch(url, init);
const attempt = fixtureAttempt();
attempt.status = 'completed';
attempt.state = 'closed';
attempt.reward_granted = false;
attempt.goals = 20;
attempt.rules.skill_code = skill as BonusGameAttempt['rules']['skill_code'];
if (skill === 'marksmanship') {
  attempt.total_points = 4000;
  attempt.rules.qualification_rules = { type: 'points_in_time', targetPoints: 4000, activeTimeMs: 180000, scoring: DEFAULT_MARKSMANSHIP_SCORING_RULES };
}
if (skill === 'endurance') {
  attempt.goals = 50;
  attempt.shots_taken = 100;
  attempt.rules.qualification_rules = { type: 'survive_goal_windows', activeTimeMs: 180000, goalWindowMs: 7000 };
}
attempt.record = {
  elapsedMs: skill === 'endurance' ? 180000 : 130000,
  shots: attempt.shots_taken,
  goals: attempt.goals,
  points: attempt.total_points,
  personalImproved: true,
  globalImproved: true,
  personalBest: { elapsedMs: skill === 'endurance' ? 180000 : 130000, shots: attempt.shots_taken, goals: attempt.goals, points: attempt.total_points },
  place: 1,
  stars: 12,
  experience: 40,
};
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {params.get('view') === 'result' ? (
      <BonusResult
        kind="completed"
        attempt={attempt}
        onCatalog={() => undefined}
        onRetry={() => undefined}
        retrying={false}
      />
    ) : (
      <BonusRecordsModal
        gameId="fixture"
        skillCode={skill as BonusGameAttempt['rules']['skill_code']}
        title="Пляж"
        currentUserId="me"
        onClose={() => undefined}
      />
    )}
  </QueryClientProvider>,
);
