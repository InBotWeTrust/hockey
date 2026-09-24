import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
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

  it('renders invitee experience with the profile experience treatment', async () => {
    renderScreen();

    const experience = await screen.findByLabelText('Опыт: 2960');
    expect(experience).toHaveClass('referral-player__experience');
    expect(experience.querySelector('svg')).toBeInTheDocument();
    expect(experience).toHaveTextContent('2 960');
  });
});
