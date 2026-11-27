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
