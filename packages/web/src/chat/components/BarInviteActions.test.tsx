import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { BarInviteActions, type BarInviteMetadata } from './BarInviteActions.js';
import { gameApi } from '../../bar/games/api.js';
import * as cards from '../../bar/cards/onlineApi.js';
vi.mock('../../bar/games/api.js', () => ({ gameApi: { respond: vi.fn() } }));
vi.mock('../../bar/cards/onlineApi.js', () => ({ respond: vi.fn() }));
const invite = { type: 'bar_game_invite' as const, inviteId: 'invite', kind: 'darts' as const, senderId: 'a', receiverId: 'b', capacity: 2, expiresAt: new Date(Date.now()+60000).toISOString(), status: 'pending' as const, matchId: null, roomId: null };
function show(metadata: BarInviteMetadata = invite, isOwn = false) { return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><BarInviteActions invite={metadata} isOwn={isOwn}/></MemoryRouter></QueryClientProvider>); }
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
it('accepts once while request is pending and shows a destination afterwards', async () => {
  let finish!: (v: { matchId: string }) => void;
  vi.mocked(gameApi.respond).mockReturnValue(new Promise(resolve => { finish=resolve; }));
  show();
  fireEvent.click(screen.getByText('Принять')); fireEvent.click(screen.getByText('Принять'));
  expect(gameApi.respond).toHaveBeenCalledTimes(1);
  await act(async () => finish({ matchId:'match' }));
  expect(screen.getByText('Перейти в игру')).toBeInTheDocument();
});
it('expires without an action after the response deadline', () => {
  vi.useFakeTimers(); show({ ...invite, expiresAt: new Date(Date.now()+1000).toISOString() });
  act(() => vi.advanceTimersByTime(1100));
  expect(screen.getByText('Срок приглашения истёк')).toBeInTheDocument();
  expect(screen.queryByText('Принять')).not.toBeInTheDocument();
});
it('lets the sender cancel, but never accept their own invitation', async () => {
  vi.mocked(gameApi.respond).mockResolvedValue({matchId:null}); show(invite,true);
  expect(screen.queryByText('Принять')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Отменить приглашение'));
  await waitFor(() => expect(screen.getByText('Приглашение отменено')).toBeInTheDocument());
});
it('retains available actions after a failed response', async () => {
  vi.mocked(gameApi.respond).mockRejectedValue(new Error('Нет связи')); show();
  fireEvent.click(screen.getByText('Принять'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи');
  expect(screen.getByText('Принять')).toBeEnabled();
});
it('uses the card API for a table invitation', async () => {
  vi.mocked(cards.respond).mockResolvedValue({matchId:null,roomId:'room'});
  show({...invite,kind:'cards'});
  fireEvent.click(screen.getByText('Принять'));
  expect(await screen.findByText('Перейти к столу')).toBeInTheDocument();
  expect(cards.respond).toHaveBeenCalledWith('invite','accept');
});
