import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AchievementCard } from '../screens/AchievementsScreen.js';
describe('unavailable bar achievement', () => {
  it('does not reveal or open a hidden character or reward', () => {
    const onOpen = vi.fn();
    render(
      <AchievementCard
        achievement={{
          id: 'hidden',
          title: 'Мария — дурак',
          photoUrl: '/secret.webp',
          description: 'secret',
          requirement: 'Выиграть в дурака',
          category: 'bar',
          availability: 'active',
          futureTag: null,
          rewardCurrency: 0,
          rewardStars: 35,
          rewardExperience: 35,
          status: 'locked',
          isUnlocked: false,
          isClaimable: false,
          accessRequirement: 'amateur',
        }}
        onOpen={onOpen}
        onClaim={vi.fn()}
        claimDisabled={false}
      />,
    );
    expect(screen.getByText('Неизвестное задание')).toBeInTheDocument();
    expect(screen.queryByText(/Мария|дурак/)).not.toBeInTheDocument();
    expect(screen.getByText('Доступно со статуса «Любитель»')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Награда/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).not.toHaveBeenCalled();
  });
});

it('renders a bar description instead of the generic mode placeholder', () => {
  render(
    <AchievementCard
      achievement={{
        id: 'bar-test',
        title: 'Большой заход',
        photoUrl: '/achievements/bar/darts-180-v1.webp',
        description: 'Три дротика сходятся в утроении двадцатки. Поймай нужное движение.',
        requirement: 'Набрать 180 очков.',
        category: 'bar',
        availability: 'active',
        futureTag: null,
        rewardCurrency: 0,
        rewardStars: 10,
        rewardExperience: 10,
        status: 'locked',
        isUnlocked: true,
        isClaimable: false,
        bar: { mode: 'character' },
      }}
      onOpen={vi.fn()}
      onClaim={vi.fn()}
      claimDisabled={false}
    />,
  );
  expect(
    screen.getByText('Три дротика сходятся в утроении двадцатки. Поймай нужное движение.'),
  ).toBeInTheDocument();
  expect(screen.queryByText('С персонажем')).not.toBeInTheDocument();
});

it.each(['bar', 'duel'] as const)('shows descriptions only on one-off %s cards', (category) => {
  const achievement = {
    id: 'display-test',
    title: 'Test task',
    photoUrl: '/test.webp',
    description: 'Full task description',
    requirement: 'Task condition',
    category,
    availability: 'active' as const,
    futureTag: null,
    rewardCurrency: 0,
    rewardStars: 3,
    rewardExperience: 3,
    status: 'locked' as const,
    isUnlocked: true,
    isClaimable: false,
    ...(category === 'bar' ? { bar: { mode: 'social' as const } } : {}),
    stage: {
      current: 1,
      total: 4,
      requirement: 'Stage condition',
      progressValue: 0,
      targetValue: 4,
      history: [],
    },
  };
  const { rerender } = render(
    <AchievementCard
      achievement={achievement}
      onOpen={vi.fn()}
      onClaim={vi.fn()}
      claimDisabled={false}
    />,
  );
  expect(screen.queryByText('Full task description')).not.toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toBeInTheDocument();
  rerender(
    <AchievementCard
      achievement={{ ...achievement, stage: { ...achievement.stage, total: 1 } }}
      onOpen={vi.fn()}
      onClaim={vi.fn()}
      claimDisabled={false}
    />,
  );
  expect(screen.getByText('Full task description')).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  rerender(
    <AchievementCard
      achievement={{ ...achievement, status: 'claimed', stage: { ...achievement.stage, total: 1 } }}
      onOpen={vi.fn()}
      onClaim={vi.fn()}
      claimDisabled={false}
    />,
  );
  expect(screen.queryByText('Все уровни пройдены')).not.toBeInTheDocument();
});
