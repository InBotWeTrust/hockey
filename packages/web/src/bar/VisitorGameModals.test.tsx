import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type * as VisitorApiModule from './visitorApi.js';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { createMatch, visitorPhrases, type BarGameSnapshot } from '@hockey/game-core';
import { useVisitor } from './visitorApi.js';
import { CharacterLaunch } from './games/CharacterLaunch.js';
import { GameResult } from './games/GameModals.js';
import { DurakResultModal } from './cards/DurakModals.js';
import { gameCopy } from './games/content.js';
import { visitorGameResetLabel } from './VisitorGameGate.js';
vi.mock('./visitorApi.js', async (original) => ({
  ...(await original<typeof VisitorApiModule>()),
  useVisitor: vi.fn(),
}));
function allowance(remaining = 0, active = false) {
  return {
    data: {
      revision: 1,
      settings: {
        cardDays: 30,
        cardGames: 2,
        freeGames: 3,
        freeMessages: 10,
        cardMessages: 30,
        products: [],
      },
      state: {
        serverNow: new Date(2026, 9, 19, 12).toISOString(),
        resetAt: new Date(2026, 9, 20, 0).toISOString(),
        card: { purchased: active, active, expiresAt: active ? '2026-11-19T00:00:00Z' : null },
        messages: { remaining: 0, paid: 0 },
        games: {
          byCharacter: { daria: remaining, maria: remaining, grigory: remaining },
          remaining,
        },
      },
    },
    error: false,
    refresh: vi.fn(),
  } as unknown as ReturnType<typeof useVisitor>;
}
beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(useVisitor).mockReturnValue(allowance());
});
it('formats the refresh using the server day across a year boundary even if the phone clock differs', () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date(2035, 4, 12));
    expect(
      visitorGameResetLabel(
        new Date(2027, 0, 1, 0).toISOString(),
        new Date(2026, 11, 31, 23).toISOString(),
      ),
    ).toBe('1 ч 0 мин');
  } finally {
    vi.useRealTimers();
  }
});
function mount(ui: ReactNode) {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={ui} />
        <Route path="/bar" element={<p>Стойка Игоря</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
it('replaces the invitation with a single refusal and one image when entering without attempts', () => {
  mount(<CharacterLaunch character="daria" close={vi.fn()} />);
  expect(screen.getAllByRole('img')).toHaveLength(1);
  expect(screen.queryByText(gameCopy.darts.invite)).not.toBeInTheDocument();
  expect(visitorPhrases.daria.games.some((phrase) => screen.queryByText(`«${phrase}»`))).toBe(true);
  expect(screen.getByText('Попытки обновятся через:')).toBeInTheDocument();
  expect(screen.getByText('12 ч 0 мин')).toBeInTheDocument();
  expect(screen.queryByText(/Игр осталось: 0/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'К Игорю за картой' }));
  expect(screen.getByText('Стойка Игоря')).toBeInTheDocument();
});
it('preserves the normal invitation and play action while attempts remain', () => {
  vi.mocked(useVisitor).mockReturnValue(allowance(1));
  mount(<CharacterLaunch character="daria" close={vi.fn()} />);
  expect(screen.getByText(gameCopy.darts.invite)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Играть' })).toBeInTheDocument();
  expect(screen.queryByText('Попытки обновятся через:')).not.toBeInTheDocument();
});
it('keeps the outcome, score and back action after the final game without inviting a replay', () => {
  const view: BarGameSnapshot = {
    id: 'last',
    kind: 'ochko',
    character: 'grigory',
    player: 0,
    participants: [
      { userId: 'a', displayName: 'Игрок', avatarUrl: null },
      { userId: 'grigory', displayName: 'Григорий', avatarUrl: null },
    ],
    runtime: createMatch('ochko', 0, 0, true, 1),
    ready: null,
    serverNow: 1000,
  };
  view.runtime.game.winner = 1;
  const back = vi.fn();
  mount(<GameResult view={view} replay={vi.fn()} back={back} />);
  expect(screen.getByRole('heading', { name: 'Поражение' })).toBeInTheDocument();
  expect(screen.getByLabelText('Итоговый счёт')).toBeInTheDocument();
  expect(screen.getAllByRole('img')).toHaveLength(1);
  expect(screen.queryByText(gameCopy.ochko.loss)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться в бар' }));
  expect(back).toHaveBeenCalledOnce();
});
it('retains Maria return action at zero attempts and does not sell a card to an active holder', () => {
  vi.mocked(useVisitor).mockReturnValue(allowance(0, true));
  const back = vi.fn();
  mount(<DurakResultModal result={1} onReplay={vi.fn()} onBack={back} />);
  expect(screen.queryByRole('button', { name: /К Игорю/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться в бар' }));
  expect(back).toHaveBeenCalledOnce();
});
