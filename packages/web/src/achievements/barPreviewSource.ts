import type { AchievementDto, ClaimAchievementResponse } from '../api/achievements.js';
import {
  barAchievementDefinitions,
  buildBarAchievements,
  type PreviewLevel,
} from './barCatalog.js';
import type { AchievementsDataSource } from '../screens/AchievementsScreen.js';
export function createBarPreviewSource(level: PreviewLevel, demo = false): AchievementsDataSource {
  let items = buildBarAchievements(level).map((item, index): AchievementDto => {
    if (!demo || item.accessRequirement || !item.stage) return item;
    if (index % 12 === 0)
      return {
        ...item,
        status: 'completed_unclaimed',
        isClaimable: true,
        stage: { ...item.stage, progressValue: item.stage.targetValue },
      };
    return {
      ...item,
      stage: { ...item.stage, progressValue: Math.max(0, Math.floor(item.stage.targetValue / 2)) },
    };
  });
  let stars = 0;
  const count = () => items.filter((x) => x.isClaimable).length;
  return {
    competitionLevel: level,
    fetch: async () => ({ achievements: items, unclaimedCount: count() }),
    claim: async (id: string): Promise<ClaimAchievementResponse> => {
      const item = items.find((x) => x.id === id);
      if (!item || item.accessRequirement || !item.isClaimable || !item.stage)
        throw new Error('Reward is unavailable');
      const definition = barAchievementDefinitions.find((x) => x.id === id)!;
      const current = item.stage.current;
      const next = definition.levels[current];
      const history = [
        ...item.stage.history,
        {
          stageNumber: current,
          claimedAt: new Date().toISOString(),
          requirement: item.stage.requirement,
        },
      ];
      const rewards = {
        currency: 0,
        stars: item.rewardStars,
        experience: item.rewardExperience,
        tokens: 0,
      };
      stars += rewards.stars;
      const countProgress = new Set([1, 2, 6, 7, 13, 14, 20, 21, 26, 27, 30, 31, 36, 37, 44]).has(
        definition.number,
      );
      const achievement: AchievementDto = {
        ...item,
        isClaimable: false,
        status: next ? 'locked' : 'claimed',
        rewardStars: next?.stars ?? item.rewardStars,
        rewardExperience: next?.experience ?? item.rewardExperience,
        requirement: next?.requirement ?? item.requirement,
        stage: {
          ...item.stage,
          current: next?.level ?? current,
          requirement: next?.requirement ?? item.stage.requirement,
          progressValue: next ? 0 : item.stage.targetValue,
          targetValue: next ? (countProgress ? next.target : 1) : item.stage.targetValue,
          history,
        },
      };
      items = items.map((x) => (x.id === id ? achievement : x));
      return {
        achievement,
        stage: { claimed: current, opened: next?.level ?? null },
        rewards,
        balances: {
          currencyBalance: 0,
          starBalance: stars,
          experienceBalance: stars,
          tokenBalance: 0,
        },
        unclaimedCount: count(),
      };
    },
  };
}
