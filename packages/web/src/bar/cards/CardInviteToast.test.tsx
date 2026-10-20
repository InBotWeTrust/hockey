import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { CardInviteToast } from './CardInviteToast.js';
import { incomingInvites, useCardInvites } from './cardInvites.js';
import { useAuthStore } from '../../auth/authStore.js';
import * as api from './onlineApi.js';
vi.mock('./onlineApi.js', () => ({ lobby: vi.fn(), respond: vi.fn() }));
const invitation = {
  id: 'i',
  sender_id: 'a',
  receiver_id: 'b',
  sender_name: 'Александр',
  receiver_name: 'Игрок',
  status: 'pending',
  match_id: null,
  expires_at: new Date(Date.now() + 600000).toISOString(),
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useCardInvites.getState().setIncoming([]);
  useAuthStore.setState({ user: null });
});
it('counts only live incoming invitations', () => {
  expect(
    incomingInvites(
      [
        invitation,
        { ...invitation, id: 'expired', expires_at: '2000-01-01' },
        { ...invitation, id: 'out', receiver_id: 'a' },
        { ...invitation, id: 'closed', status: 'declined' },
      ],
      'b',
    ),
  ).toHaveLength(1);
});
it('opens an invited table with its format in the notification', async () => {
  vi.mocked(api.lobby).mockResolvedValue({
    matchId: null,
    searching: false,
    invites: [{ ...invitation, room_id: 'room', capacity: 5 }],
  });
  vi.mocked(api.respond).mockResolvedValue({ matchId: null, roomId: 'room' });
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<CardInviteToast previewUserId="b" />} />
        <Route path="/bar/cards/room/room" element={<div>Комната стола</div>} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
  expect(screen.getByText(/стол на 5/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Принять' }));
  await act(async () => {});
  expect(screen.getByText('Комната стола')).toBeInTheDocument();
});
it('accepts once and opens the match', async () => {
  useAuthStore.setState({
    user: { id: 'b' } as NonNullable<ReturnType<typeof useAuthStore.getState>['user']>,
  });
  vi.mocked(api.lobby).mockResolvedValue({
    matchId: null,
    searching: false,
    invites: [invitation],
  });
  vi.mocked(api.respond).mockResolvedValue({ matchId: 'match' });
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<CardInviteToast />} />
        <Route path="/bar/cards/match/match" element={<div>Партия</div>} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Принять' }));
  });
  expect(api.respond).toHaveBeenCalledWith('i', 'accept');
  expect(screen.getByText('Партия')).toBeInTheDocument();
  expect(useCardInvites.getState().incoming).toHaveLength(0);
});
it('keeps indicators but hides the toast during a game', async () => {
  useAuthStore.setState({
    user: { id: 'b' } as NonNullable<ReturnType<typeof useAuthStore.getState>['user']>,
  });
  vi.mocked(api.lobby).mockResolvedValue({
    matchId: null,
    searching: false,
    invites: [invitation],
  });
  render(
    <MemoryRouter>
      <CardInviteToast suppressed />
    </MemoryRouter>,
  );
  await act(async () => {});
  expect(screen.queryByRole('button', { name: 'Принять' })).not.toBeInTheDocument();
  expect(useCardInvites.getState().incoming).toHaveLength(1);
});

it('declines and immediately clears indicators', async () => {
  useAuthStore.setState({
    user: { id: 'b' } as NonNullable<ReturnType<typeof useAuthStore.getState>['user']>,
  });
  vi.mocked(api.lobby).mockResolvedValue({
    matchId: null,
    searching: false,
    invites: [invitation],
  });
  vi.mocked(api.respond).mockResolvedValue({ matchId: null });
  render(
    <MemoryRouter>
      <CardInviteToast />
    </MemoryRouter>,
  );
  await act(async () => {});
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Отклонить' }));
  });
  expect(api.respond).toHaveBeenCalledWith('i', 'decline');
  expect(useCardInvites.getState().incoming).toHaveLength(0);
  expect(screen.queryByText(/приглашает сыграть/)).not.toBeInTheDocument();
});
