import { act, renderHook, waitFor } from '@testing-library/react';
import { it, expect, vi, afterEach } from 'vitest';
import { useMariaGame } from './useMariaGame.js';
import type { mariaViewToGame} from './mariaApi.js';
import { mariaApi, type MariaMatchView } from './mariaApi.js';
vi.mock('./mariaApi.js', async (original) => ({
  ...(await original<{ mariaApi: typeof mariaApi; mariaViewToGame: typeof mariaViewToGame }>()),
  mariaApi: { start: vi.fn(), read: vi.fn(), move: vi.fn() },
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
const view = (revision: number): MariaMatchView => ({
  id: 'match',
  hand: [{ id: 'clubs-6', rank: 6, suit: 'clubs' }],
  opponentCount: 6,
  deckCount: 24,
  attacker: 0,
  table: [],
  limit: 6,
  trump: 'clubs',
  trumpCard: { id: 'clubs-14', rank: 14, suit: 'clubs' },
  phase: 'attack',
  revision,
  result: null,
  deadline: Date.now() + 30000,
  serverNow: Date.now(),
  opponent: { displayName: 'Мария', avatarUrl: null },
});
it('sends one authoritative command for two immediate taps and keeps the returned revision', async () => {
  vi.mocked(mariaApi.start).mockResolvedValue(view(0));
  let finish: (v: MariaMatchView) => void = () => {};
  vi.mocked(mariaApi.move).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = renderHook(() => useMariaGame());
  await waitFor(() => expect(result.current.controller).not.toBeNull());
  act(() => {
    result.current.controller!.dispatch({ type: 'play', cardId: 'clubs-6' });
    result.current.controller!.dispatch({ type: 'play', cardId: 'clubs-6' });
  });
  expect(mariaApi.move).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish(view(1));
  });
  expect(result.current.controller!.game.revision).toBe(1);
});
