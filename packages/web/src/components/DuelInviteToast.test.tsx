import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { DuelInviteToast } from './DuelInviteToast.js';
import { DUEL_INVITE_RECEIVED_EVENT } from '../chat/useChatSocket.js';
import type { ChatMessageDTO } from '../chat/api.js';
import * as amateurDuelApi from '../api/amateurDuel.js';

function LocationProbe(): JSX.Element {
  const location = useLocation();
  return (
    <output aria-label="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function renderToast(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/chat/direct']}>
        <LocationProbe />
        <DuelInviteToast />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function emitInvite(matchId = '11111111-1111-1111-1111-111111111111'): void {
  const message = {
    id: 'msg-1',
    chatId: 'chat-1',
    senderId: 'opponent-1',
    senderDisplayName: 'Дима',
    senderAvatarUrl: null,
    content: '',
    createdAt: '2026-05-29T10:00:00.000Z',
    isDeleted: false,
    replyToId: null,
    metadata: {
      type: 'amateur_duel_invite',
      matchId,
      challengerName: 'Дима',
      templateTitle: 'Экспресс',
    },
    reactions: [],
  } as ChatMessageDTO;

  act(() => {
    window.dispatchEvent(
      new CustomEvent(DUEL_INVITE_RECEIVED_EVENT, {
        detail: { chatId: 'chat-1', message },
      }),
    );
  });
}

describe('DuelInviteToast', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts an incoming invite and opens the duel rink', async () => {
    const matchId = '22222222-2222-2222-2222-222222222222';
    const accept = vi.spyOn(amateurDuelApi, 'acceptAmateurDuel').mockResolvedValue({
      match: {} as Awaited<ReturnType<typeof amateurDuelApi.acceptAmateurDuel>>['match'],
    });
    vi.spyOn(amateurDuelApi, 'declineAmateurDuel').mockResolvedValue({
      match: {} as Awaited<ReturnType<typeof amateurDuelApi.declineAmateurDuel>>['match'],
    });

    renderToast();
    emitInvite(matchId);

    expect(await screen.findByText('Дима вызывает на дуэль')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Принять' }));

    await waitFor(() => expect(accept).toHaveBeenCalledWith(matchId));
    expect(screen.getByLabelText('location')).toHaveTextContent(
      `/?view=amateur&match=${matchId}&play=1`,
    );
  });

  it('declines an incoming invite without navigation', async () => {
    vi.spyOn(amateurDuelApi, 'acceptAmateurDuel').mockResolvedValue({
      match: {} as Awaited<ReturnType<typeof amateurDuelApi.acceptAmateurDuel>>['match'],
    });
    const decline = vi.spyOn(amateurDuelApi, 'declineAmateurDuel').mockResolvedValue({
      match: {} as Awaited<ReturnType<typeof amateurDuelApi.declineAmateurDuel>>['match'],
    });

    renderToast();
    emitInvite();

    fireEvent.click(await screen.findByRole('button', { name: 'Отклонить' }));

    await waitFor(() =>
      expect(decline).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111'),
    );
    expect(screen.getByLabelText('location')).toHaveTextContent('/chat/direct');
  });
});
