import { DAILY_PERIOD_SPEED_PRESETS } from '@hockey/game-core';
import type { DailyStateResponse } from '../api/duel.js';
import type { TrainingStateResponse } from '../api/training.js';
import type { InitialTrainingCatalogResponse } from '../api/initialTraining.js';
export const baseState: DailyStateResponse = {
  state: 'idle',
  current_period: 0,
  current_period_shots: 0,
  current_period_goals: 0,
  daily_total_shots: 0,
  daily_total_goals: 0,
  lifetime_total_shots: 0,
  lifetime_total_goals: 0,
  amateur_unlock_goals_required: 300,
  period_started_at: null,
  period_ends_at: null,
  break_ends_at: null,
  day_date: '2026-04-25',
  next_day_starts_at: '2026-04-26T00:00:00.000Z',
  server_now: '2026-04-25T12:00:00.000Z',
  daily_seed: null,
  goalie_id: 'rookie',
  shots_per_period: 30,
  total_periods: 3,
  period_speed_presets: [...DAILY_PERIOD_SPEED_PRESETS],
  recent_periods: [],
  previous_game: null,
  training_cooldown_ends_at: null,
};

export const trainingIdleState: TrainingStateResponse = {
  state: 'idle',
  selected_period: null,
  shots_taken: 0,
  goals: 0,
  shots_limit: 500,
  day_date: '2026-04-25',
  next_day_starts_at: '2026-04-26T00:00:00.000Z',
  training_seed: null,
  started_at: null,
  server_now: '2026-04-25T12:00:00.000Z',
  goalie_id: 'rookie',
  period_speed_presets: [...DAILY_PERIOD_SPEED_PRESETS],
  tournament_day_locked: false,
  tournament_day_starts_at: null,
};

export const initialTrainingCatalog: InitialTrainingCatalogResponse = {
  enabled: true,
  completed_count: 0,
  beginner_training_completed: false,
  total_count: 7,
  open_training_unlocked: false,
  open_training_unlock_source: null,
  gameplay_lock: null,
  advanced_training: {
    enabled: true,
    access: {
      amateur_completed: true,
      beginner_training_completed: false,
      unlocked: false,
    },
    completed_count: 0,
    total_count: 8,
    exercises: [],
  },
  exercises: [
    ['first-shot', 'Первый бросок', 'available', 10],
    ['three-positions', 'Три позиции', 'locked', 9],
    ['follow-the-goal', 'Следи за воротами', 'locked', 10],
    ['moving-goal', 'Три зоны', 'locked', 9],
    ['find-the-gap', 'Три зоны с вратарём', 'locked', 9],
    ['pressure-window', 'Меняй стороны', 'locked', 6],
    ['game-pace', 'Игровой темп', 'locked', 6],
  ].map(([key, title, state, targetGoals], index) => ({
    key,
    position: index + 1,
    title,
    description: `Описание: ${title}`,
    targetGoals,
    rewardStars: 1,
    rewardExperience: 1,
    state,
  })) as InitialTrainingCatalogResponse['exercises'],
};

initialTrainingCatalog.advanced_training.exercises = (
  [
    'board-side',
    'open-net',
    'crossing',
    'goalie-leaving',
    'narrow-gap',
    'counter-direction',
    'second-tempo',
    'rhythm-reset',
  ] as const
).map((key, i) => ({
  key,
  position: i + 1,
  title: [
    'От борта',
    'Открытый угол',
    'Пересечение',
    'Выход вратаря',
    'Узкий просвет',
    'Противоход',
    'Второй темп',
    'Смена ритма',
  ][i]!,
  description: 'Отработка хоккейного приёма',
  skill: 'Точность',
  goal: 'Выполни приём',
  rewardStars: 2,
  rewardExperience: 5,
  state: i === 0 ? 'available' : 'locked',
}));
