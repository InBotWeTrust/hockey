import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDefaultBarLayout } from '@hockey/game-core';
import { BarScene } from './BarScene.js';
import { lobby as cardLobby } from './cards/onlineApi.js';
import { BarGamesLobby } from './games/BarGamesLobby.js';
import { gameApi } from './games/api.js';
vi.mock('../auth/authStore.js', () => ({
  useAuthStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector({ user: { id: 'me' } }),
    { getState: () => ({ user: { id: 'me' } }) },
  ),
}));
vi.mock('./games/api.js', () => ({
  gameApi: { lobby: vi.fn(), players: vi.fn().mockResolvedValue([]) },
}));
vi.mock('./cards/onlineApi.js', () => ({
  lobby: vi
    .fn()
    .mockResolvedValue({ matchId: null, searching: false, invites: [], serverNow: 100 }),
}));
const layout = createDefaultBarLayout(),
  online = layout.slots.find((s) => s.occupantId === 'online')!.id;
const invite = {
  id: 'i',
  kind: 'ochko' as const,
  senderId: 'other',
  receiverId: 'me',
  senderName: 'Дмитрий',
  receiverName: 'Игрок',
  status: 'pending' as const,
  expiresAt: 10000,
  matchId: null,
};
const lobby = {
  matchId: null,
  searching: null,
  invites: [invite],
  expiresAt: null,
  serverNow: 100,
};
beforeEach(() => {
  vi.mocked(gameApi.lobby).mockResolvedValue(lobby);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const props = { layout, onSelectSlot: vi.fn(), onAction: vi.fn() };
it('opens the terminal and selects the incoming game without needing the toast', async () => {
  render(
    <MemoryRouter>
      <BarScene {...props} activeSlotId={online} />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(screen.getByRole('tab', { name: 'Очко' })).toHaveAttribute('aria-selected', 'true'),
  );
  expect(await screen.findByText('Дмитрий')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Принять' })).toBeInTheDocument();
});
it('does not reopen a manually closed invitation on focus, but opens it again on reentry', async () => {
  const v = render(
    <MemoryRouter>
      <BarScene {...props} activeSlotId={online} />
    </MemoryRouter>,
  );
  await screen.findByRole('button', { name: 'Закрыть терминал' });
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть терминал' }));
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  expect(screen.queryByRole('button', { name: 'Закрыть терминал' })).not.toBeInTheDocument();
  v.rerender(
    <MemoryRouter>
      <BarScene {...props} activeSlotId="bar-8" />
    </MemoryRouter>,
  );
  v.rerender(
    <MemoryRouter>
      <BarScene {...props} activeSlotId={online} />
    </MemoryRouter>,
  );
  expect(await screen.findByRole('button', { name: 'Закрыть терминал' })).toBeInTheDocument();
});
it('ignores expired invitations and late responses after leaving the terminal', async () => {
  vi.mocked(gameApi.lobby).mockResolvedValue({ ...lobby, invites: [{ ...invite, expiresAt: 50 }] });
  const v = render(
    <MemoryRouter>
      <BarScene {...props} activeSlotId={online} />
    </MemoryRouter>,
  );
  await act(async () => {});
  expect(screen.queryByRole('button', { name: 'Закрыть терминал' })).not.toBeInTheDocument();
  let resolve!: (s: typeof lobby) => void;
  vi.mocked(gameApi.lobby).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  v.rerender(
    <MemoryRouter>
      <BarScene {...props} activeSlotId="bar-8" />
    </MemoryRouter>,
  );
  await act(async () => {
    resolve(lobby);
  });
  expect(screen.queryByRole('button', { name: 'Закрыть терминал' })).not.toBeInTheDocument();
});
it('keeps the terminal closed for outgoing invitations', async () => {
  vi.mocked(gameApi.lobby).mockResolvedValue({
    ...lobby,
    invites: [{ ...invite, senderId: 'me', receiverId: 'other' }],
  });
  render(
    <MemoryRouter>
      <BarScene {...props} activeSlotId={online} />
    </MemoryRouter>,
  );
  await act(async () => {});
  expect(screen.queryByRole('button', { name: 'Закрыть терминал' })).not.toBeInTheDocument();
});

it('selects the incoming game on the standalone games page too', async () => {
  render(
    <MemoryRouter>
      <BarGamesLobby initial="darts" />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(screen.getByRole('tab', { name: 'Очко' })).toHaveAttribute('aria-selected', 'true'),
  );
  expect(await screen.findByRole('button', { name: 'Принять' })).toBeInTheDocument();
});
it('opens a new incoming invitation after an initially empty response', async () => {
  vi.mocked(gameApi.lobby).mockResolvedValue({ ...lobby, invites: [] });
  render(
    <MemoryRouter>
      <BarScene {...props} activeSlotId={online} />
    </MemoryRouter>,
  );
  await act(async () => {});
  expect(screen.queryByRole('button', { name: 'Закрыть терминал' })).not.toBeInTheDocument();
  vi.mocked(gameApi.lobby).mockResolvedValue(lobby);
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  expect(await screen.findByRole('button', { name: 'Закрыть терминал' })).toBeInTheDocument();
});

it('opens the cards tab for an incoming card-game invitation',async()=>{
 vi.mocked(gameApi.lobby).mockResolvedValue({...lobby,invites:[]});
 vi.mocked(cardLobby).mockResolvedValue({matchId:null,searching:false,serverNow:100,invites:[{
  id:'card-invite',sender_id:'other',receiver_id:'me',sender_name:'Карточный соперник',receiver_name:'Игрок',status:'pending',match_id:null,expires_at:new Date(10000).toISOString(),
 }]});
 render(<MemoryRouter><BarScene {...props} activeSlotId={online}/></MemoryRouter>);
 await waitFor(()=>expect(screen.getByRole('tab',{name:'Карты'})).toHaveAttribute('aria-selected','true'));
 expect(await screen.findByRole('button',{name:'Закрыть терминал'})).toBeInTheDocument();
});
