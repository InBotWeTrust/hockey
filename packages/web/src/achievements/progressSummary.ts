export interface AchievementProgressItem {
  status?: 'locked' | 'completed_unclaimed' | 'claimed';
  stage?: {
    total: number;
    history: Array<{ stageNumber: number }>;
  };
}

export function achievementLevelCounts(
  achievement: AchievementProgressItem,
): { completed: number; total: number } {
  if (!achievement.stage) {
    return { completed: achievement.status === 'locked' ? 0 : 1, total: 1 };
  }

  const currentCompleted = achievement.status === 'completed_unclaimed' ? 1 : 0;
  return {
    completed: Math.min(achievement.stage.total, achievement.stage.history.length + currentCompleted),
    total: achievement.stage.total,
  };
}

export function summarizeAchievementProgress(achievements: AchievementProgressItem[]): {
  completed: number;
  total: number;
  levels: { completed: number; total: number };
} {
  return achievements.reduce(
    (summary, achievement) => {
      const levels = achievementLevelCounts(achievement);
      return {
        completed: summary.completed + (levels.completed === levels.total ? 1 : 0),
        total: summary.total + 1,
        levels: {
          completed: summary.levels.completed + levels.completed,
          total: summary.levels.total + levels.total,
        },
      };
    },
    { completed: 0, total: 0, levels: { completed: 0, total: 0 } },
  );
}

export function highestCompletedLevel(achievement: AchievementProgressItem): number {
  return achievementLevelCounts(achievement).completed;
}
