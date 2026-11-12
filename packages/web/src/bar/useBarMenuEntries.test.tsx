import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import type { BarGameInvite } from '@hockey/game-core';
import type { Invite } from './cards/onlineApi.js';
import { useAuthStore } from '../auth/authStore.js';
import { useBarMenuEntries } from './useBarMenuEntries.js';
import { useGameInvites } from './games/gameInviteStore.js';
import { useCardInvites } from './cards/cardInvites.js';
import { useBarMenuStore } from './barMenuStore.js';
import { gameNotifications } from '../city/gameNotifications.js';

function Probe() {
  const entries = useBarMenuEntries();
  const notices = gameNotifications(entries);
  return <output aria-label="notifications">{JSON.stringify({ ids: entries.map(e => e.id), count: notices.count, urgent: notices.urgent })}</output>;
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useAuthStore.setState({ user: null });
  useGameInvites.getState().reset(null);
  useCardInvites.getState().setIncoming([]);
  useBarMenuStore.setState({ cards: null, games: null });
});
it.each(['/profile', '/sections', '/bar/games/match/current'])(
  'keeps pending incoming games red and reachable without a toast on %s until they expire', async route => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(1000);
    useAuthStore.setState({ user: { id: 'owner' } as NonNullable<ReturnType<typeof useAuthStore.getState>['user']> });
    useGameInvites.getState().reset('owner');
    useGameInvites.getState().replace('owner', [{ id: 'game', receiverId: 'owner', senderId: 'other', senderName: 'Opponent', kind: 'billiards', status: 'pending', expiresAt: 61000 } as BarGameInvite], useGameInvites.getState().revision);
    useCardInvites.getState().setIncoming([{ id: 'card', receiver_id: 'owner', sender_id: 'other', sender_name: 'Card player', status: 'pending', expires_at: new Date(61000).toISOString() } as Invite]);
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[route]}><Probe /></MemoryRouter></QueryClientProvider>);
    expect(JSON.parse(screen.getByLabelText('notifications').textContent!)).toEqual({ ids: ['bar-card-invite-card', 'bar-invite-game'], count: 2, urgent: true });
    await act(async () => { vi.advanceTimersByTime(61000); });
    expect(JSON.parse(screen.getByLabelText('notifications').textContent!)).toEqual({ ids: [], count: 0, urgent: false });
  },
);
