import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi, afterEach } from 'vitest';
import { DurakScreen } from './DurakScreen.js';
import { DurakLaunchModal } from './DurakModals.js';
import { createGame } from './rules.js';
afterEach(() => {
  vi.useRealTimers();
});
it('launches through existing modal with image and play button', () => {
  const play = vi.fn();
  render(<DurakLaunchModal onClose={() => {}} onPlay={play} />);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Играть' }));
  expect(play).toHaveBeenCalledOnce();
});
it('shows hand and deadline without menu exit or rules', () => {
  vi.useFakeTimers();
  render(
    <MemoryRouter>
      <DurakScreen initialGame={{ ...createGame(() => 0.4), attacker: 0 }} />
    </MemoryRouter>,
  );
  expect(screen.getByLabelText('Осталось времени')).toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Твои карты' }).querySelectorAll('button')).toHaveLength(
    6,
  );
  expect(screen.getByRole('region', { name: 'Меню игры' })).not.toContainElement(
    screen.getByRole('button', { name: 'Выйти из игры' }),
  );
  expect(screen.getByRole('region', { name: 'Меню игры' })).not.toContainElement(
    screen.getByRole('button', { name: 'Правила' }),
  );
  expect(screen.getByRole('img', { name: 'Аватар Марии' })).toBeInTheDocument();
});
it('shows settled result and supports replay', () => {
  render(
    <MemoryRouter>
      <DurakScreen initialGame={{ ...createGame(() => 0.4), phase: 'ended', result: 0 }} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('dialog')).toHaveTextContent('Ты выиграл');
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it.each(['attack', 'defend', 'taking'] as const)(
  'puts %s instructions below the hockey scoreboard',
  (phase) => {
    vi.useFakeTimers();
    const base = createGame(() => 0.4);
    const game = {
      ...base,
      attacker: phase === 'defend' ? (1 as const) : (0 as const),
      phase,
      table: phase === 'attack' ? [] : [{ attack: base.hands[1][0]! }],
    };
    render(
      <MemoryRouter>
        <DurakScreen initialGame={game} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('heading', { name: 'Дурак с Марией' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Назад' })).not.toBeInTheDocument();
    const menu = screen.getByRole('region', { name: 'Меню игры' });
    expect(menu).toHaveTextContent('Мария');
    expect(menu).toHaveTextContent(String(game.hands[1].length));
    expect(menu).toContainElement(screen.getByLabelText('Осталось времени'));
    if (phase === 'defend')
      expect(screen.getByRole('status')).toHaveTextContent('Отбей карту или возьми');
    expect(screen.getByRole('status')).toHaveAttribute(
      'data-tone',
      phase === 'defend' ? 'danger' : phase === 'taking' ? 'warning' : 'success',
    );
  },
);

it('shows deck count only on the back and hides trump after drawing the last card', () => {
  vi.useFakeTimers();
  const game = { ...createGame(() => 0.4), attacker: 0 as const };
  const { unmount } = render(
    <MemoryRouter>
      <DurakScreen initialGame={game} />
    </MemoryRouter>,
  );
  const menu = screen.getByRole('region', { name: 'Меню игры' });
  const count = screen.getByLabelText('Карт в колоде');
  expect(menu).not.toContainElement(count);
  expect(count).toHaveTextContent(String(game.deck.length));
  expect(screen.queryByLabelText('Козырная масть')).not.toBeInTheDocument();
  expect(screen.getByRole('img', { name: /^Козырь/ })).toBeInTheDocument();
  unmount();
  render(
    <MemoryRouter>
      <DurakScreen initialGame={{ ...game, deck: [] }} />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('img', { name: /^Козырь/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('img', { name: 'Колода' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Карт в колоде')).not.toBeInTheDocument();
});

it('uses endurance timer colours at ten and four seconds', () => {
  vi.useFakeTimers();
  render(
    <MemoryRouter>
      <DurakScreen initialGame={{ ...createGame(() => 0.4), attacker: 0 }} />
    </MemoryRouter>,
  );
  const timer = screen.getByLabelText('Осталось времени');
  expect(timer).toHaveAttribute('data-tone', 'success');
  act(() => vi.advanceTimersByTime(10000));
  expect(timer).toHaveAttribute('data-tone', 'warning');
  act(() => vi.advanceTimersByTime(6000));
  expect(timer).toHaveAttribute('data-tone', 'danger');
});

it('shows rules, cancels exit and settles surrender as a loss during Maria turn', () => {
  vi.useFakeTimers();
  render(
    <MemoryRouter>
      <DurakScreen initialGame={{ ...createGame(() => 0.4), attacker: 1 }} />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Правила' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Как играть');
  fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
  fireEvent.click(screen.getByRole('button', { name: 'Выйти из игры' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('засчитано поражение');
  fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Выйти из игры' }));
  fireEvent.click(screen.getByRole('button', { name: 'Сдаться' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Ты проиграл');
  act(() => vi.advanceTimersByTime(30000));
  expect(screen.getByRole('dialog')).toHaveTextContent('Ты проиграл');
});

it('selects on first click and commits on second click without resetting the deadline', () => {
  vi.useFakeTimers();
  const game = { ...createGame(() => 0.4), attacker: 0 as const };
  render(
    <MemoryRouter>
      <DurakScreen initialGame={game} />
    </MemoryRouter>,
  );
  const hand = screen.getByRole('group', { name: 'Твои карты' });
  const card = hand.querySelector('button')!;
  act(() => vi.advanceTimersByTime(3000));
  fireEvent.click(card);
  expect(screen.getByRole('status')).toHaveTextContent('Подтвердить выбор');
  expect(card).toHaveAttribute('aria-pressed', 'true');
  expect(hand.querySelectorAll('button')).toHaveLength(6);
  expect(screen.getByLabelText('Осталось времени')).toHaveTextContent('17');
  fireEvent.click(card);
  expect(hand.querySelectorAll('button')).toHaveLength(5);
});
it('confirms a defence and asks for a target when multiple attacks can be beaten', () => {
  vi.useFakeTimers();
  const game = createGame(() => 0.4);
  const attack1 = { id: 'a', suit: 'clubs' as const, rank: 6 };
  const attack2 = { id: 'b', suit: 'clubs' as const, rank: 7 };
  const defence = { id: 'c', suit: 'clubs' as const, rank: 10 };
  render(
    <MemoryRouter>
      <DurakScreen
        initialGame={{
          ...game,
          attacker: 1,
          phase: 'defend',
          hands: [[defence], game.hands[1]],
          table: [{ attack: attack1 }, { attack: attack2 }],
        }}
      />
    </MemoryRouter>,
  );
  const card = screen.getByRole('group', { name: 'Твои карты' }).querySelector('button')!;
  fireEvent.click(card);
  expect(screen.getByRole('button', { name: 'Отбить 6 ♣' })).toBeDisabled();
  fireEvent.click(card);
  expect(screen.getByRole('status')).toHaveTextContent('Выбери карту на столе');
  fireEvent.click(screen.getByRole('button', { name: 'Отбить 7 ♣' }));
  expect(screen.getByRole('group', { name: 'Твои карты' }).querySelectorAll('button')).toHaveLength(
    0,
  );
});

it('swipes up to commit directly and ignores the subsequent click', () => {
  vi.useFakeTimers();
  vi.stubGlobal('PointerEvent', MouseEvent);
  render(
    <MemoryRouter>
      <DurakScreen initialGame={{ ...createGame(() => 0.4), attacker: 0 }} />
    </MemoryRouter>,
  );
  const hand = screen.getByRole('group', { name: 'Твои карты' });
  const card = hand.querySelector('button')!;
  fireEvent.pointerDown(card, { clientX: 40, clientY: 150 });
  fireEvent.pointerUp(card, { clientX: 42, clientY: 80 });
  expect(hand.querySelectorAll('button')).toHaveLength(5);
  fireEvent.click(card);
  expect(hand.querySelectorAll('button')).toHaveLength(5);
  vi.unstubAllGlobals();
});
it('keeps horizontal scrolling from committing a card', () => {
  vi.useFakeTimers();
  vi.stubGlobal('PointerEvent', MouseEvent);
  render(
    <MemoryRouter>
      <DurakScreen initialGame={{ ...createGame(() => 0.4), attacker: 0 }} />
    </MemoryRouter>,
  );
  const hand = screen.getByRole('group', { name: 'Твои карты' });
  const card = hand.querySelector('button')!;
  fireEvent.pointerDown(card, { clientX: 40, clientY: 150 });
  fireEvent.pointerUp(card, { clientX: 140, clientY: 140 });
  expect(hand.querySelectorAll('button')).toHaveLength(6);
  vi.unstubAllGlobals();
});
