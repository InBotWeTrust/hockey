import * as cardApi from '../cards/onlineApi.js';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { BarGamesLobby, NewGameLobby } from './BarGamesLobby.js';
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

it('retains challenge mode while switching games',async()=>{
 vi.mocked(gameApi.lobby).mockResolvedValue(empty);
 vi.mocked(gameApi.players).mockResolvedValue([]);
 render(<MemoryRouter><BarGamesLobby initial="darts" embedded/></MemoryRouter>);
 fireEvent.click(screen.getByRole('tab',{name:'Вызвать'}));
 fireEvent.click(screen.getByRole('tab',{name:'Шашки'}));
 expect(screen.getByRole('tab',{name:'Вызвать'})).toHaveAttribute('aria-selected','true');
 expect(screen.getByRole('textbox',{name:'Имя игрока'})).toBeVisible();
});

it('shows online presence beside quick-pick avatars in other games',async()=>{
 vi.mocked(gameApi.lobby).mockResolvedValue(empty);
 vi.mocked(gameApi.players).mockResolvedValue([{userId:'online',displayName:'Online player',avatarUrl:null,lastSeenAt:new Date().toISOString()}]);
 render(<MemoryRouter><NewGameLobby kind="darts"/></MemoryRouter>);
 fireEvent.click(screen.getByRole('tab',{name:'Вызвать'}));
 expect(await screen.findByLabelText('В сети: Online player')).toBeVisible();
});

it('preserves the meeting mode across cards and other games',async()=>{
 vi.mocked(gameApi.lobby).mockResolvedValue(empty);
 vi.mocked(gameApi.players).mockResolvedValue([]);
 vi.spyOn(cardApi,'lobby').mockResolvedValue({matchId:null,searching:false,invites:[]});
 vi.spyOn(cardApi,'searchPlayers').mockResolvedValue([]);
 render(<MemoryRouter><BarGamesLobby initial="darts" embedded/></MemoryRouter>);
 expect(screen.getByText('Выбор игры · 7')).toBeVisible();
 fireEvent.click(screen.getByRole('tab',{name:'Вызвать'}));
 fireEvent.click(screen.getByRole('tab',{name:'Карты'}));
 await waitFor(()=>expect(cardApi.lobby).toHaveBeenCalled());
 expect(screen.getByRole('tab',{name:'Вызвать'})).toHaveAttribute('aria-selected','true');
 fireEvent.click(screen.getByRole('tab',{name:'Бильярд'}));
 expect(screen.getByRole('tab',{name:'Вызвать'})).toHaveAttribute('aria-selected','true');
 fireEvent.click(screen.getByRole('tab',{name:'Найти'}));
 fireEvent.click(screen.getByRole('tab',{name:'Карты'}));
 expect(screen.getByRole('tab',{name:'Найти'})).toHaveAttribute('aria-selected','true');
});

it('shows an outgoing two-player invite without redundant size and cancels from the right-hand icon',async()=>{
 const {useAuthStore}=await import('../../auth/authStore.js');
 useAuthStore.setState({user:{id:'me'} as never});
 vi.mocked(gameApi.lobby).mockResolvedValue({...empty,invites:[{id:'out',matchId:null,kind:'ochko',senderId:'me',receiverId:'other',senderName:'Я',receiverName:'Анна',status:'pending',expiresAt:Date.now()+60000}]});
 vi.mocked(gameApi.respond).mockResolvedValue({matchId:null});
 render(<MemoryRouter><NewGameLobby kind="ochko"/></MemoryRouter>);
 await screen.findByText('Анна');
 expect(screen.queryByText(/2 игрока/)).toBeNull();
 const cancel=screen.getByRole('button',{name:'Отменить приглашение'});
 expect(cancel).toHaveClass('icon-btn');fireEvent.click(cancel);
 await waitFor(()=>expect(gameApi.respond).toHaveBeenCalledWith('out','cancel'));
 useAuthStore.setState({user:null});
});
