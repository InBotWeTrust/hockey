import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/authStore.js';
import * as api from '../api/tournament.js';
import { TournamentFixtureLive } from './TournamentFixtureLive.js';
import type {
  TournamentRealtimeEvent,
  TournamentSocketOptions,
  TournamentSocketStatus,
} from './TournamentSocket.js';

const socketHarness = vi.hoisted(() => ({
  options: null as TournamentSocketOptions | null,
}));

vi.mock('./TournamentSocket.js', () => {
  return {
    TournamentSocket: class {
      constructor(options: TournamentSocketOptions) {
        socketHarness.options = options;
      }

      connect(): void {
        socketHarness.options?.onStatus('open' as TournamentSocketStatus);
      }

      disconnect(): void {}
    },
  };
});

const fixture = {
  id: '00000000-0000-4000-8000-000000000801',
  fixtureNumber: 1,
  stage: 'regular',
  roundNumber: 1,
  scheduledStartsAt: '2030-09-01T07:00:00.000Z',
  windowEndsAt: '2030-09-01T08:00:00.000Z',
  status: 'active',
  venueMode: 'home_selected',
  home: { userId: 'home-user', name: 'Первый' },
  away: { userId: 'away-user', name: 'Второй' },
  score: { home: 2, away: 1 },
} as const;

function localInputValue(value: string): string {
  const date = new Date(value);
  const part = (number: number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
}

function renderLive() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onBack = vi.fn();
  const onPlay = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <TournamentFixtureLive fixture={fixture} onBack={onBack} onPlay={onPlay} />
    </QueryClientProvider>,
  );
  return { onBack, onPlay };
}

describe('TournamentFixtureLive', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    socketHarness.options = null;
    useAuthStore.setState({
      accessToken: 'ACCESS',
      refreshToken: 'REFRESH',
      user: { id: 'away-user', displayName: 'Второй' },
    });
    vi.spyOn(api, 'fetchFixtureLiveState').mockResolvedValue({
      live: {
        fixtureId: fixture.id,
        status: 'active',
        score: { home: 2, away: 1 },
        scheduledStartsAt: fixture.scheduledStartsAt,
        windowEndsAt: fixture.windowEndsAt,
        proposal: {
          id: '00000000-0000-4000-8000-000000000802',
          proposedAt: '2030-09-01T07:30:00.000Z',
          proposedByUserId: 'home-user',
          state: 'pending',
        },
        overlapWarnings: [],
        duelMatchId: '00000000-0000-4000-8000-000000000803',
        participants: [
          { userId: 'home-user', state: 'ready', currentPeriod: 1, goals: 2, shotsTaken: 10 },
          {
            userId: 'away-user',
            state: 'period_active',
            currentPeriod: 1,
            goals: 1,
            shotsTaken: 8,
          },
        ],
      },
    });
    vi.spyOn(api, 'respondFixtureLiveProposal').mockResolvedValue({
      fixtureId: fixture.id,
      proposalId: '00000000-0000-4000-8000-000000000802',
      state: 'accepted',
      overlapWarnings: [],
    });
  });

  it('shows current game progress, presence and lets the opponent accept a proposal', async () => {
    renderLive();

    expect(await screen.findByText('2 : 1')).toBeInTheDocument();
    expect(screen.getByText('Соединение установлено')).toBeInTheDocument();
    expect(screen.getByText('Период 1 · 10 бросков')).toBeInTheDocument();
    expect(screen.getByLabelText('Предложить другое время')).toHaveAttribute(
      'min',
      localInputValue(fixture.scheduledStartsAt),
    );
    expect(screen.getByLabelText('Предложить другое время')).toHaveAttribute(
      'max',
      localInputValue(fixture.windowEndsAt),
    );

    act(() => {
      socketHarness.options?.onEvent({
        type: 'tournament:presence',
        fixtureId: fixture.id,
        sequence: 20,
        payload: { userId: 'home-user', online: true },
      } satisfies TournamentRealtimeEvent);
    });
    expect(screen.getByText('Первый в сети')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить время' }));
    await waitFor(() => {
      expect(api.respondFixtureLiveProposal).toHaveBeenCalledWith(
        fixture.id,
        '00000000-0000-4000-8000-000000000802',
        true,
      );
    });
  });

  it('keeps the play action available while automatic updates reconnect', async () => {
    const { onPlay } = renderLive();

    await screen.findByText('2 : 1');
    act(() => socketHarness.options?.onStatus('reconnecting'));
    fireEvent.click(screen.getByRole('button', { name: 'Перейти к игре' }));

    expect(screen.getByText('Восстанавливаем обновление счёта…')).toBeInTheDocument();
    expect(screen.queryByText(/live|HTTP/i)).not.toBeInTheDocument();
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('offers to create the first duel segment when the fixture has no match yet', async () => {
    vi.spyOn(api, 'fetchFixtureLiveState').mockResolvedValue({
      live: {
        fixtureId: fixture.id,
        status: 'open',
        score: { home: 0, away: 0 },
        scheduledStartsAt: fixture.scheduledStartsAt,
        windowEndsAt: fixture.windowEndsAt,
        proposal: null,
        overlapWarnings: [],
        duelMatchId: null,
        participants: [],
      },
    });
    const { onPlay } = renderLive();

    fireEvent.click(await screen.findByRole('button', { name: 'Начать игру' }));

    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('shows a Russian non-blocking warning for another tournament fixture at the proposed time', async () => {
    vi.spyOn(api, 'fetchFixtureLiveState').mockResolvedValue({
      live: {
        fixtureId: fixture.id,
        status: 'active',
        score: { home: 2, away: 1 },
        scheduledStartsAt: fixture.scheduledStartsAt,
        windowEndsAt: fixture.windowEndsAt,
        proposal: {
          id: '00000000-0000-4000-8000-000000000802',
          proposedAt: '2030-09-01T07:30:00.000Z',
          proposedByUserId: 'home-user',
          state: 'pending',
        },
        overlapWarnings: [
          {
            fixtureId: '00000000-0000-4000-8000-000000000804',
            tournamentId: '00000000-0000-4000-8000-000000000805',
            tournamentTitle: 'Кубок соперника',
            scheduledStartsAt: '2030-09-01T07:00:00.000Z',
            windowEndsAt: '2030-09-01T08:00:00.000Z',
            acceptedLiveAt: null,
          },
        ],
        duelMatchId: null,
        participants: [],
      },
    });

    renderLive();

    const warning = await screen.findByRole('alert');
    expect(warning).toHaveTextContent('Время пересекается с другой игрой');
    expect(warning).toHaveTextContent('Кубок соперника');
    expect(screen.getByRole('button', { name: 'Подтвердить время' })).not.toBeDisabled();
  });
});
