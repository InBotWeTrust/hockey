import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { createMatch, type BarGameSnapshot } from '@hockey/game-core';
import type * as ResultReadyModule from './useResultReady.js';
import { BarGameScreen } from './BarGameScreen.js';
vi.mock('./useResultReady.js', async (importOriginal) => ({ ...await importOriginal<typeof ResultReadyModule>(), useResultReady: () => true }));
const views = vi.hoisted(() => ({ get: null as null | ((id: string) => BarGameSnapshot) }));
vi.mock('./useGameMatch.js', () => ({
  useGameMatch: (id: string) => ({
    view: views.get!(id),
    now: 1000,
    busy: false,
    armBlocked: false,
    error: null,
    uncertain: false,
    send: vi.fn(),
    retry: vi.fn(),
  }),
}));
vi.mock('./CharacterLaunch.js', async () => {
  const { useNavigate } = await import('react-router-dom');
  return {
    CharacterLaunch: function FakeStake() {
      const navigate = useNavigate();
      return <button onClick={() => navigate('/bar/games/match/new')}>Подтвердить ставку</button>;
    },
  };
});
afterEach(cleanup);
it('closes the stake dialog when a paid replay navigates to the new table', async () => {
  const runtime = createMatch('ochko', 0, 0, true, 1);
  const base: BarGameSnapshot = {
    id: 'old',
    kind: 'ochko',
    character: 'grigory',
    player: 0,
    participants: [
      { userId: 'u', displayName: 'Игрок', avatarUrl: null },
      { userId: 'grigory', displayName: 'Григорий', avatarUrl: null },
    ],
    runtime,
    ready: null,
    serverNow: 1000,
    stake: { amount: 20, payout: 40 },
  };
  views.get = (id) =>
    id === 'old'
      ? {
          ...base,
          runtime: { ...runtime, animationUntil: 0, game: { ...runtime.game, winner: 0 } },
        }
      : { ...base, id: 'new', stake: { amount: 20, payout: null } };
  render(
    <MemoryRouter initialEntries={['/bar/games/match/old']}>
      <Routes>
        <Route path="/bar/games/match/:id" element={<BarGameScreen />} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить ставку' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Подтвердить ставку' })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('button', { name: 'Ещё карту' })).toBeInTheDocument();
});
