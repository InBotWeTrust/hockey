import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { DurakRoomScreen } from './DurakRoomScreen.js';
import * as api from './roomApi.js';
import type { RoomView } from './roomApi.js';
vi.mock('./roomApi.js', () => ({ readRoom: vi.fn(), roomCommand: vi.fn(), roomInvite: vi.fn() }));
vi.mock('./onlineApi.js', () => ({
  searchPlayers: vi.fn(async () => []),
  respond: vi.fn(async () => ({ matchId: null })),
}));
const room: RoomView = {
  id: 'table',
  owner: 'a',
  capacity: 5,
  status: 'waiting',
  searchUntil: Date.now() + 120000,
  countdownAt: null,
  proposed: false,
  ready: [],
  revision: 1,
  serverNow: Date.now(),
  pending: [],
  game: null,
  seats: [
    { userId: 'a', displayName: 'Александр', avatarUrl: null, count: 0, status: 'waiting' },
    { userId: 'b', displayName: 'Борис', avatarUrl: null, count: 0, status: 'waiting' },
  ],
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});
function renderRoom() {
  render(
    <MemoryRouter initialEntries={['/room/table']}>
      <Routes>
        <Route path="/room/:id" element={<DurakRoomScreen previewUserId="a" />} />
      </Routes>
    </MemoryRouter>,
  );
}
it('shows occupied and free seats with a fixed waiting timer', async () => {
  vi.mocked(api.readRoom).mockResolvedValue(room);
  renderRoom();
  await act(async () => {});
  expect(screen.getByText('Игроки: 2 из 5')).toBeInTheDocument();
  expect(screen.getAllByText('Свободное место')).toHaveLength(3);
  expect(screen.queryByText('Начать вдвоём')).not.toBeInTheDocument();
});
it('offers renewal and explicit consent after expiry', async () => {
  vi.mocked(api.readRoom).mockResolvedValue({ ...room, searchUntil: 0 });
  vi.mocked(api.roomCommand).mockResolvedValue({
    ...room,
    searchUntil: null,
    proposed: true,
    ready: ['a'],
    revision: 2,
  });
  renderRoom();
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Начать текущим составом' }));
  await act(async () => {});
  expect(api.roomCommand).toHaveBeenCalledWith('table', 1, { type: 'propose' });
  expect(screen.getByText('Готовы: 1 из 2')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Готов' })).toBeDisabled();
});
it('ignores an older snapshot arriving after a command', async () => {
  vi.useFakeTimers();
  let resolve!: (r: RoomView) => void;
  vi.mocked(api.readRoom)
    .mockResolvedValueOnce({ ...room, searchUntil: 0 })
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
  vi.mocked(api.roomCommand).mockResolvedValue({ ...room, revision: 2 });
  renderRoom();
  await act(async () => {});
  await act(async () => {
    vi.advanceTimersByTime(1500);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Продолжить поиск' }));
  await act(async () => {});
  await act(async () => {
    resolve({ ...room, searchUntil: 0 });
  });
  expect(screen.queryByRole('button', { name: 'Продолжить поиск' })).not.toBeInTheDocument();
});

it('shows the invited player in the reserved seat and cancels with a right-hand icon',async()=>{
 const invited={...room,capacity:2,seats:[room.seats[0]!],searchUntil:null,pending:['c'],invitations:[{id:'invite-c',userId:'c',displayName:'ренго か',avatarUrl:'/invited-avatar.png'}]};
 vi.mocked(api.readRoom).mockResolvedValueOnce(invited).mockResolvedValue({...invited,pending:[],invitations:[]});renderRoom();await act(async()=>{});
 expect(screen.getByText('ренго か')).toBeInTheDocument();
 expect(document.querySelector('img[src="/invited-avatar.png"]')).not.toBeNull();
 expect(screen.queryByText('Свободное место')).not.toBeInTheDocument();
 expect(screen.getAllByText('Ждём ответ на приглашение')).toHaveLength(1);
 expect(screen.queryByRole('button',{name:'Продолжить поиск'})).not.toBeInTheDocument();
 expect(screen.queryByText(/Поиск завершён/)).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Отменить'})).not.toBeInTheDocument();
 const cancel=screen.getByRole('button',{name:'Отменить приглашение: ренго か'});
 expect(cancel).toHaveClass('icon-btn');fireEvent.click(cancel);await act(async()=>{});
 expect((await import('./onlineApi.js')).respond).toHaveBeenCalledWith('invite-c','cancel');
 expect(screen.queryByText('ренго か')).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Начать поиск'})).toBeInTheDocument();
});

it('returns to the bar without leaving the table or cancelling invitations', async () => {
 vi.mocked(api.readRoom).mockResolvedValue({...room,pending:['target']});
 render(<MemoryRouter initialEntries={['/room/table']}><Routes><Route path="/room/:id" element={<DurakRoomScreen previewUserId="a"/>}/><Route path="/bar" element={<p>Bar map</p>}/></Routes></MemoryRouter>);
 await act(async()=>{});
 fireEvent.click(screen.getByRole('button',{name:'Назад'}));
 expect(screen.getByText('Bar map')).toBeVisible();
 expect(api.roomCommand).not.toHaveBeenCalled();
});
