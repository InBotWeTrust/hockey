import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { it, expect, vi, afterEach } from 'vitest';
import { OnlineDurakLobby } from './OnlineDurakLobby.js';
import * as api from './onlineApi.js';
vi.mock('./onlineApi.js', () => ({
  lobby: vi.fn(),
  queue: vi.fn(),
  invite: vi.fn(),
  respond: vi.fn(),
  searchPlayers: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});
it('does not overwrite a search action with an older poll response', async () => {
  vi.useFakeTimers();
  const idle = { matchId: null, searching: false, invites: [] };
  let stale!: (state: api.Lobby) => void;
  vi.mocked(api.lobby)
    .mockResolvedValueOnce(idle)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          stale = resolve;
        }),
    )
    .mockResolvedValue({ ...idle, searching: true });
  vi.mocked(api.queue).mockResolvedValue({ matchId: null });
  render(
    <MemoryRouter>
      <OnlineDurakLobby />
    </MemoryRouter>,
  );
  await act(async () => {});
  await act(async () => {
    vi.advanceTimersByTime(2000);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Начать поиск' }));
  });
  expect(screen.getByRole('button', { name: 'Отменить поиск' })).toBeInTheDocument();
  await act(async () => {
    stale(idle);
  });
  expect(screen.getByRole('button', { name: 'Отменить поиск' })).toBeInTheDocument();
});

it('offers Maria through the existing launch modal', async () => {
  vi.mocked(api.lobby).mockResolvedValue({ matchId: null, searching: false, invites: [] });
  render(
    <MemoryRouter>
      <OnlineDurakLobby />
    </MemoryRouter>,
  );
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Сыграть с Марией' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Дурак с Марией');
  expect(screen.getByRole('button', { name: 'Играть' })).toBeInTheDocument();
});
