import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { NewGameLobby } from './BarGamesLobby.js';
import { createMatch } from '@hockey/game-core';
import { gameApi } from './api.js';
vi.mock('./api.js', () => ({
  gameApi: {
    lobby: vi.fn(),
    read: vi.fn(),
    players: vi.fn(),
    queue: vi.fn(),
    invite: vi.fn(),
    respond: vi.fn(),
    start: vi.fn(),
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const empty = { matchId: null, searching: null, invites: [], expiresAt: null, serverNow: 0 };
it.each(['darts', 'billiards', 'checkers'] as const)(
  'keeps %s online-only with the card lobby controls',
  async (kind) => {
    vi.mocked(gameApi.lobby).mockResolvedValue(empty);
    vi.mocked(gameApi.queue).mockResolvedValue({ matchId: null });
    render(
      <MemoryRouter>
        <NewGameLobby kind={kind} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(gameApi.lobby).toHaveBeenCalled());
    expect(screen.queryByText('С персонажем')).not.toBeInTheDocument();
    expect(screen.queryByText('С игроком')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Начать поиск' }));
    await waitFor(() => expect(gameApi.queue).toHaveBeenCalledWith(kind, false));
    expect(gameApi.start).not.toHaveBeenCalled();
  },
);
it('selects a player before sending a game-specific challenge', async () => {
  vi.mocked(gameApi.lobby).mockResolvedValue(empty);
  vi.mocked(gameApi.players).mockResolvedValue([
    { userId: 'other', displayName: 'Соперник', avatarUrl: null },
  ]);
  vi.mocked(gameApi.invite).mockResolvedValue({ ok: true });
  render(
    <MemoryRouter>
      <NewGameLobby kind="darts" />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Вызвать' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Выбрать соперника Соперник' }));
  expect(gameApi.invite).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Вызвать: Соперник' }));
  await waitFor(() => expect(gameApi.invite).toHaveBeenCalledWith('darts', 'other'));
});
it('cancels an active search through the shared queue API', async () => {
  vi.mocked(gameApi.lobby).mockResolvedValue({ ...empty, searching: 'checkers' });
  vi.mocked(gameApi.queue).mockResolvedValue({ matchId: null });
  render(
    <MemoryRouter>
      <NewGameLobby kind="checkers" />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Отменить поиск' }));
  await waitFor(() => expect(gameApi.queue).toHaveBeenCalledWith('checkers', true));
});
it('accepts an incoming invitation without launching a character match', async () => {
  vi.mocked(gameApi.lobby).mockResolvedValue({
    ...empty,
    invites: [
      {
        id: 'invite',
        kind: 'billiards',
        senderId: 'other',
        receiverId: 'me',
        senderName: 'Соперник',
        receiverName: 'Игрок',
        status: 'pending',
        matchId: null,
        expiresAt: 10000,
      },
    ],
  });
  vi.mocked(gameApi.respond).mockResolvedValue({ matchId: null });
  render(
    <MemoryRouter>
      <NewGameLobby kind="billiards" />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Принять' }));
  await waitFor(() => expect(gameApi.respond).toHaveBeenCalledWith('invite', 'accept'));
  expect(gameApi.start).not.toHaveBeenCalled();
});

it('shows the opponent in a clickable active-match card and stays in the lobby until clicked', async () => {
  vi.mocked(gameApi.lobby).mockResolvedValue({ ...empty, matchId: 'active' });
  vi.mocked(gameApi.read).mockResolvedValue({
    id: 'active',
    kind: 'darts',
    character: null,
    player: 0,
    participants: [
      { userId: 'me', displayName: 'Игрок', avatarUrl: null },
      { userId: 'other', displayName: 'Алексей', avatarUrl: '/avatar.webp' },
    ],
    runtime: createMatch('darts', 0, 0, false, 1),
    ready: null,
    serverNow: 0,
  });
  function Location() {
    return <span data-testid="location">{useLocation().pathname}</span>;
  }
  render(
    <MemoryRouter>
      <NewGameLobby kind="darts" />
      <Location />
    </MemoryRouter>,
  );
  const card = await screen.findByRole('button', { name: 'Продолжить партию · Алексей' });
  expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  expect(card.querySelector('img')).toHaveAttribute('src', '/avatar.webp');
  expect(card).not.toHaveTextContent('Дартс');
  expect(card).toHaveTextContent('Партия идёт');
  expect(screen.queryByRole('button', { name: 'Продолжить партию' })).not.toBeInTheDocument();
  fireEvent.click(card);
  expect(screen.getByTestId('location')).toHaveTextContent('/bar/games/match/active');
});
