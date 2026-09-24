import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as referralsApi from '../api/referrals.js';
import { ReferralsScreen } from './ReferralsScreen.js';

vi.mock('../chat/components/UserProfileSheet.js', () => ({
  UserProfileSheet: ({ sender }: { sender: { displayName: string } | null }) =>
    sender ? <div role="dialog" aria-label="Профиль игрока">{sender.displayName}</div> : null,
}));

const summary: referralsApi.ReferralSummary = {
  code: 'TEAM-77',
  totalInvited: 1,
  qualifiedInvited: 0,
  counts: { beginner: 1, amateur: 0, professional: 0 },
  unclaimedRewardsCount: 0,
  milestones: [],
};

function renderScreen(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/referrals']}>
        <ReferralsScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ReferralsScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(referralsApi, 'fetchReferralSummary').mockResolvedValue(summary);
    vi.spyOn(referralsApi, 'fetchReferralInvitees').mockImplementation(async (level) => ({
      items: level === 'beginner'
        ? [{
            userId: 'friend-1',
            displayName: 'Никита Орлов',
            avatarUrl: null,
            experience: 2_960,
            competitionLevel: 'beginner',
            joinedAt: '2026-09-24T12:00:00.000Z',
          }]
        : [],
      total: level === 'beginner' ? 1 : 0,
    }));
  });

  it('opens an invitee in the same swipeable profile sheet used by chats', async () => {
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: /Никита Орлов/ }));

    expect(screen.getByRole('dialog', { name: 'Профиль игрока' })).toHaveTextContent('Никита Орлов');
  });

  it('shows invite instructions and copies the referral code with the shared toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    renderScreen();

    expect(await screen.findByRole('heading', { name: 'Приглашай друзей' })).toBeInTheDocument();
    expect(screen.getByText(/друг должен указать его при первой регистрации/)).toBeInTheDocument();
    const copyCode = screen.getByRole('button', { name: 'Скопировать код приглашения' });
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(copyCode);
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith('TEAM-77');
    expect(screen.getByRole('status')).toHaveTextContent('Скопировано');
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('renders invitee experience with the profile experience treatment', async () => {
    renderScreen();

    const experience = await screen.findByLabelText('Опыт: 2960');
    expect(experience).toHaveClass('referral-player__experience');
    expect(experience.querySelector('svg')).toBeInTheDocument();
    expect(experience).toHaveTextContent('2 960');
  });

  it('separates readable section counts with a centered dot', async () => {
    renderScreen();

    const beginnerHeading = await screen.findByText((_, element) =>
      element?.classList.contains('section-label') === true && element.textContent === 'Новички · 1');
    const count = beginnerHeading.querySelector('.referral-list-section__count');

    expect(beginnerHeading).toHaveTextContent('Новички · 1');
    expect(count).toHaveTextContent('· 1');
  });

  it('shows one compact empty state when there are no invitees at all', async () => {
    vi.spyOn(referralsApi, 'fetchReferralSummary').mockResolvedValueOnce({
      ...summary,
      totalInvited: 0,
      counts: { beginner: 0, amateur: 0, professional: 0 },
    });
    vi.spyOn(referralsApi, 'fetchReferralInvitees').mockResolvedValue({ items: [], total: 0 });

    renderScreen();

    expect(await screen.findByText('Здесь появятся приглашённые друзья')).toBeInTheDocument();
    expect(screen.getByText('Поделись ссылкой или кодом выше')).toBeInTheDocument();
    expect(screen.queryByText(/0 друзей дошли/)).not.toBeInTheDocument();
    expect(screen.queryByText('Новички')).not.toBeInTheDocument();
    expect(screen.queryByText('Любители')).not.toBeInTheDocument();
    expect(screen.queryByText('Профи')).not.toBeInTheDocument();
  });

  it('uses a compact inline empty state for an empty category', async () => {
    renderScreen();

    expect(screen.queryByText('Пока никто не дошёл до уровня «Любитель»')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('Пока никого')).toHaveLength(2));
    const emptyStates = screen.getAllByText('Пока никого');
    expect(emptyStates.every((item) => item.classList.contains('referral-empty--inline'))).toBe(true);
    expect(emptyStates.every((item) => item.closest('.glass') === null)).toBe(true);
  });

  it('shows next reward progress in the task level format without the old caption', async () => {
    vi.spyOn(referralsApi, 'fetchReferralSummary').mockResolvedValueOnce({
      ...summary,
      totalInvited: 12,
      qualifiedInvited: 8,
      milestones: [{
        id: 'reward-10',
        qualifiedReferrals: 10,
        rewardStars: 150,
        unlockId: null,
        unlockedAt: null,
        claimedAt: null,
      }],
    });

    renderScreen();

    const progress = await screen.findByRole('progressbar', { name: 'Прогресс до следующей награды' });
    expect(progress).toHaveAttribute('aria-valuenow', '8');
    expect(progress).toHaveAttribute('aria-valuemax', '10');
    expect(progress).toHaveTextContent('8 / 10');
    expect(screen.queryByText('8 друзей дошли до уровня «Любитель»')).not.toBeInTheDocument();
  });
});
