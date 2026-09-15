export interface AchievementStageDefinition {
  achievementId: string;
  stageNumber: number;
  requirement: string;
  target: Record<string, number | string | boolean>;
  rewardCurrency: number;
  rewardStars: number;
  rewardExperience: number;
  rewardTokens: number;
}

interface StageInput {
  requirement: string;
  target: Record<string, number | string | boolean>;
  stars: number;
  coins?: number;
  tokens?: number;
}

function stages(achievementId: string, definitions: readonly StageInput[]) {
  return definitions.map(
    (definition, index): AchievementStageDefinition => ({
      achievementId,
      stageNumber: index + 1,
      requirement: definition.requirement,
      target: definition.target,
      rewardCurrency: definition.coins ?? 0,
      rewardStars: definition.stars,
      rewardExperience: definition.stars,
      rewardTokens: 0,
    }),
  );
}

function numericStages(
  achievementId: string,
  field: string,
  values: readonly number[],
  rewards: readonly number[],
  requirement: (value: number) => string,
  extras: Record<string, number | string | boolean> = {},
  tokens: Readonly<Record<number, number>> = {},
) {
  return stages(
    achievementId,
    values.map((value, index) => {
      const tokenReward = tokens[index + 1];
      return {
        requirement: requirement(value),
        target: { ...extras, [field]: value },
        stars: rewards[index] ?? 0,
        ...(tokenReward === undefined ? {} : { tokens: tokenReward }),
      };
    }),
  );
}

function russianCount(value: number, one: string, few: string, many: string) {
  const modulo100 = value % 100;
  const modulo10 = value % 10;
  if (modulo100 >= 11 && modulo100 <= 14) return many;
  if (modulo10 === 1) return one;
  if (modulo10 >= 2 && modulo10 <= 4) return few;
  return many;
}

function duelCount(value: number) {
  return `${value} ${russianCount(value, 'дуэль', 'дуэли', 'дуэлей')}`;
}

function countedStages(
  achievementId: string,
  field: string,
  values: readonly number[],
  coins: readonly number[],
  rewards: readonly number[],
  requirement: (value: number) => string,
) {
  return stages(achievementId, values.map((value, index) => ({
    requirement: requirement(value),
    target: { [field]: value },
    coins: coins[index] ?? 0,
    stars: rewards[index] ?? 0,
  })));
}

export const ACHIEVEMENT_STAGE_DEFINITIONS: readonly AchievementStageDefinition[] = [
  ...numericStages(
    'career-goals',
    'total',
    [5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000],
    [25, 40, 60, 100, 150, 250, 500, 1_000],
    (value) => `Забросить ${value.toLocaleString('ru-RU')} шайб`,
    {},
    { 3: 1, 4: 1, 5: 2, 6: 3, 7: 5, 8: 10 },
  ),
  ...numericStages(
    'career-experience',
    'total',
    [500, 1_000, 3_000, 6_000, 10_000, 20_000, 30_000, 50_000],
    [5, 10, 15, 25, 40, 60, 80, 120],
    (value) => `Набрать ${value.toLocaleString('ru-RU')} опыта`,
    {},
    { 6: 1, 7: 2, 8: 3 },
  ),
  ...numericStages(
    'career-streak',
    'days',
    [5, 10, 20, 50, 100, 200, 300, 365],
    [5, 10, 20, 40, 75, 125, 200, 365],
    (value) => `Играть ${value} дней подряд`,
    {},
    { 5: 1, 6: 2, 7: 3, 8: 5 },
  ),
  ...numericStages(
    'daily-sniper-streak',
    'goalStreak',
    [30, 50, 60, 65, 70, 75, 80, 85],
    [5, 6, 7, 8, 9, 10, 12, 15],
    (value) => `Забить ${value} бросков подряд в ежедневной игре`,
  ),
  ...numericStages(
    'ice-hand',
    'accuracyPercent',
    [90, 92, 96, 97, 98, 99, 100],
    [5, 6, 7, 8, 9, 10, 12],
    (value) => `Завершить ежедневную игру с точностью ${value}%`,
  ),
  ...numericStages(
    'third-period-decides',
    'minimumFirstTwoGoals',
    [20, 22, 24, 26, 28],
    [5, 6, 7, 8, 9],
    (value) => `Забить не меньше ${value} в первых двух периодах и улучшить результат в третьем`,
    { thirdPeriodStrictlyBetter: true },
  ),
  ...numericStages(
    'final-push',
    'endingGoalStreak',
    [10, 12, 15, 20, 25],
    [5, 6, 7, 8, 9],
    (value) => `Забить последние ${value} бросков периода`,
  ),
  ...numericStages(
    'no-panic',
    'recoveryGoalStreak',
    [10, 15, 20, 25, 30],
    [5, 6, 7, 8, 9],
    (value) => `После трёх промахов подряд забить ${value} подряд`,
    { precedingNonGoals: 3 },
  ),
  ...numericStages(
    'dry-finish',
    'endingGoalStreak',
    [20, 25, 30, 35, 40, 50, 60],
    [5, 6, 7, 8, 9, 10, 12],
    (value) => `Забить последние ${value} бросков ежедневной игры`,
  ),
  ...numericStages(
    'keeping-fit',
    'minimumAccuracyPercent',
    [50, 60, 65, 75, 85, 95],
    [15, 20, 25, 30, 35, 40],
    (value) => `7 дней подряд завершать ежедневную игру с точностью не ниже ${value}%`,
    { days: 7 },
  ),
  ...numericStages(
    'sniper-week',
    'accuracyPercent',
    [70, 75, 80, 85, 90, 95],
    [20, 25, 30, 35, 40, 45],
    (value) => `Показать суммарную точность ${value}% за 7 завершённых ежедневных игр`,
    { games: 7 },
    { 6: 2 },
  ),
  ...numericStages(
    'sniper-month',
    'accuracyPercent',
    [70, 75, 80, 85, 90, 95],
    [50, 60, 70, 80, 90, 100],
    (value) => `Показать суммарную точность ${value}% за 30 завершённых ежедневных игр`,
    { games: 30 },
    { 6: 3 },
  ),
  ...numericStages(
    'training-monster',
    'accuracyPercent',
    [90, 92, 94, 96, 97, 98, 99, 100],
    [5, 6, 7, 8, 9, 10, 12, 15],
    (value) => `Завершить тренировку с точностью ${value}%`,
  ),
  ...numericStages(
    'rhythm-control',
    'goalStreak',
    [30, 40, 50, 60, 75, 80, 85, 90],
    [5, 6, 7, 8, 9, 10, 12, 15],
    (value) => `Забить ${value} бросков подряд в тренировке`,
  ),
  ...numericStages(
    'no-warmup-needed',
    'openingGoalStreak',
    [20, 25, 28, 30, 35, 40, 45, 50],
    [2, 3, 4, 5, 6, 7, 8, 9],
    (value) => `Забить первые ${value} бросков тренировки`,
  ),
  ...numericStages(
    'finish-machine',
    'endingGoalStreak',
    [20, 25, 28, 30, 35, 40, 45, 50],
    [3, 4, 5, 6, 7, 8, 9, 10],
    (value) => `Забить последние ${value} бросков тренировки`,
  ),
  ...numericStages(
    'stable-student',
    'days',
    [5, 10, 15, 20, 30, 50, 100],
    [15, 25, 35, 45, 60, 80, 120],
    (value) => `${value} дней подряд завершать тренировку с точностью не ниже 80%`,
    { minimumAccuracyPercent: 80 },
    { 7: 3 },
  ),
  ...numericStages(
    'cold-start',
    'openingGoalStreak',
    [20, 25, 30, 35, 40],
    [3, 4, 5, 6, 7],
    (value) => `Забить первые ${value} бросков дуэли`,
  ),
  ...numericStages(
    'underdog',
    'minimumExperienceDifference',
    [100, 200, 300, 500, 1_000],
    [8, 10, 12, 15, 20],
    (value) => `Победить соперника с преимуществом в опыте не меньше ${value}`,
  ),
  ...numericStages(
    'classic-speed',
    'accuracyPercent',
    [85, 90, 95, 100],
    [3, 6, 9, 12],
    (value) => `Завершить период классики за 90 секунд с точностью ${value}%`,
    { format: 'classic', maximumDurationSeconds: 90 },
  ),
  ...numericStages(
    'training-before-battle',
    'wins',
    [1, 2, 3, 4, 5],
    [5, 10, 15, 20, 25],
    (value) => `После тренировки выиграть ${duelCount(value)} подряд`,
    { requiresCompletedTraining: true },
  ),
  ...numericStages(
    'dangerous-host',
    'wins',
    [3, 4, 5, 6, 7, 8, 10],
    [5, 10, 15, 20, 25, 30, 35],
    (value) => `Выиграть ${duelCount(value)} подряд в роли хозяина`,
    { role: 'host' },
  ),
  ...numericStages(
    'dangerous-guest',
    'wins',
    [3, 4, 5, 6, 7, 8, 10],
    [8, 13, 18, 23, 28, 33, 38],
    (value) => `Выиграть ${duelCount(value)} подряд в роли гостя`,
    { role: 'guest' },
  ),
  ...numericStages(
    'blowout',
    'minimumMargin',
    [20, 25, 30, 35, 40, 45],
    [3, 4, 5, 6, 7, 8],
    (value) => `Выиграть дуэль с разницей не меньше ${value} шайб`,
  ),
  ...numericStages(
    'hunter-streak',
    'wins',
    [5, 6, 7, 8, 9, 10, 15],
    [10, 15, 20, 25, 30, 35, 50],
    (value) => `Выиграть ${duelCount(value)} подряд`,
    {},
    { 7: 2 },
  ),
  ...numericStages(
    'express-sniper',
    'goals',
    [50, 55, 60, 65, 70, 75, 80],
    [3, 4, 5, 6, 7, 8, 10],
    (value) => `Забить ${value} шайб в дуэли Экспресс`,
    { format: 'express' },
  ),
  ...numericStages(
    'mix-sniper',
    'goals',
    [75, 80, 85, 90, 95, 100, 105, 110],
    [3, 4, 5, 6, 7, 8, 10, 12],
    (value) => `Забить ${value} шайб за два периода дуэли Микс`,
    { format: 'mix' },
  ),
  ...numericStages(
    'no-error-express',
    'maximumNonGoals',
    [5, 4, 3, 2, 1, 0],
    [3, 4, 5, 6, 7, 10],
    (value) => `Выиграть Экспресс, допустив не больше ${value} ${value === 1 ? 'промаха' : 'промахов'}`,
    { format: 'express' },
  ),
  ...numericStages(
    'no-error-mix',
    'maximumNonGoals',
    [5, 4, 3, 2, 1, 0],
    [3, 4, 5, 6, 7, 10],
    (value) => `Выиграть Микс, допустив не больше ${value} ${value === 1 ? 'промаха' : 'промахов'}`,
    { format: 'mix' },
  ),
  ...numericStages(
    'no-error-classic',
    'maximumNonGoals',
    [5, 4, 3, 2, 1, 0],
    [3, 4, 5, 6, 7, 10],
    (value) => `Выиграть Классику, допустив не больше ${value} ${value === 1 ? 'промаха' : 'промахов'}`,
    { format: 'classic' },
  ),
  ...countedStages(
    'monthly-top-1', 'placements', [1, 2, 3, 4, 5],
    [7_500, 10_000, 12_500, 15_000, 20_000], [100, 125, 150, 200, 300],
    (value) => `Стать победителем рейтинга дуэлей ${value} раз`,
  ),
  ...countedStages(
    'monthly-top-3', 'placements', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    [3_750, 4_000, 4_500, 5_000, 5_500, 6_000, 7_000, 8_000, 9_000, 10_000],
    [50, 55, 60, 65, 70, 75, 85, 100, 125, 150],
    (value) => `Занять 2-е или 3-е место в рейтинге дуэлей ${value} раз`,
  ),
  ...countedStages(
    'regular-season-champion', 'placements', [1, 2, 3, 4, 5],
    [1_500, 2_000, 2_500, 3_500, 5_000], [50, 65, 80, 100, 150],
    (value) => `Занять 1-е место в регулярном чемпионате ${value} раз`,
  ),
  ...countedStages(
    'regular-season-medalist', 'placements', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    [1_000, 1_250, 1_500, 1_750, 2_000, 2_500, 3_000, 3_500, 4_000, 5_000],
    [45, 50, 55, 60, 65, 75, 85, 100, 120, 150],
    (value) => `Занять 2-е или 3-е место в регулярном чемпионате ${value} раз`,
  ),
  ...countedStages(
    'playoff-semifinal', 'appearances', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    [750, 1_000, 1_250, 1_500, 1_750, 2_000, 2_500, 3_000, 3_500, 4_000],
    [50, 55, 60, 65, 70, 80, 90, 105, 125, 150],
    (value) => `Дойти до полуфинала плей-офф ${value} раз`,
  ),
  ...countedStages(
    'playoff-final', 'appearances', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    [1_500, 1_750, 2_000, 2_500, 3_000, 3_500, 4_000, 5_000, 6_000, 7_500],
    [75, 85, 95, 105, 115, 130, 145, 165, 190, 225],
    (value) => `Дойти до финала плей-офф ${value} раз`,
  ),
  ...countedStages(
    'tournament-cup', 'wins', [1, 2, 3, 4, 5],
    [3_750, 5_000, 7_500, 10_000, 15_000], [100, 125, 160, 210, 300],
    (value) => `Выиграть турнир ${value} раз`,
  ),
  ...numericStages(
    'series-comeback', 'minimumDeficit', [2, 3], [35, 60],
    (value) => `Выиграть серию плей-офф после отставания в ${value} победы`,
  ),
  ...numericStages(
    'no-shake', 'accuracyPercent', [90, 92, 94, 95, 97, 99, 100], [20, 25, 30, 35, 40, 50, 65],
    (value) => `В матче плей-офф показать точность не ниже ${value}%`,
  ),
];

export const TIERED_ACHIEVEMENT_IDS: ReadonlySet<string> = new Set(
  ACHIEVEMENT_STAGE_DEFINITIONS.map((stage) => stage.achievementId),
);
