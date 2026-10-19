import type { ProfileData } from '../screens/profileTypes.js';
export const apartmentProfile = {
  id: 'u1',
  displayName: 'Alice T',
  registeredAt: '2026-08-14T12:00:00.000Z',
  avatarUrl: null,
  role: 'player',
  grip: 'right' as const,
  competitionLevel: 'beginner' as const,
  beginnerOnboardingCompleted: true,
  amateurUnlockGoalsRequired: 300,
  stats: { shots: 128, goals: 64, accuracy: 50, playStreakDays: 7, bestPlayStreakDays: 12 },
  achievements: [
    {
      id: 'a1',
      photoUrl: '/achievements/first-goal.webp',
      title: 'Снайпер недели',
      description: 'Лучший результат',
      requirement: 'Забить 50 голов',
      isUnlocked: true,
      status: 'claimed' as const,
      completedAt: '2026-08-14T12:00:00.000Z',
    },
  ],
  trophySummary: {
    regularSeasonWins: 4,
    tournamentChampionships: 2,
    tournamentPodiums: 5,
    completedChallenges: 11,
  },
  trophyDetails: {
    regularSeasonWins: [
      {
        id: 'regular-1',
        title: 'Кубок открытия',
        imageUrl: '/section-panoramas/apartment-2.webp',
        startsAt: '2026-08-01T10:00:00.000Z',
        endsAt: '2026-08-08T10:00:00.000Z',
        result: 'Победа в регулярном чемпионате',
      },
    ],
    tournamentChampionships: [],
    tournamentPodiums: [
      {
        id: 'podium-1',
        title: 'Кубок лета',
        imageUrl: '/section-panoramas/apartment-2.webp',
        startsAt: '2026-07-01T10:00:00.000Z',
        endsAt: '2026-07-08T10:00:00.000Z',
        result: '2-е место',
      },
    ],
    completedChallenges: [
      {
        id: 'challenge-1',
        title: 'Неделя точности',
        startsAt: '2026-08-10T10:00:00.000Z',
        endsAt: '2026-08-17T10:00:00.000Z',
        tasks: [{ title: 'Забросить шайбы', progress: 29, target: 25 }],
      },
    ],
  },
  currencyBalance: 1000,
  starBalance: 3,
  experienceBalance: 77,
} satisfies ProfileData;
export const referralSummary = {
  code: 'TEAM-77',
  totalInvited: 1,
  qualifiedInvited: 0,
  counts: { beginner: 1, amateur: 0, professional: 0 },
  unclaimedRewardsCount: 0,
  milestones: [],
};
