import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createGame, type Game } from './rules.js';
import { useDurakGame } from './useDurakGame.js';
import type { CompletedCardGame } from './cardHistory.js';
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('expires player action at 40 seconds once and cleans timers on unmount', () => {
  vi.useFakeTimers();
  const g = { ...createGame(() => 0.4), attacker: 0 as const };
  const { result, unmount } = renderHook(() => useDurakGame(g));
  act(() => vi.advanceTimersByTime(39999));
  expect(result.current.game.revision).toBe(0);
  act(() => vi.advanceTimersByTime(1));
  expect(result.current.game.revision).toBe(1);
  expect(result.current.game.table).toHaveLength(1);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it('Maria responds after two to three seconds while player timer is stopped', () => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const g = { ...createGame(() => 0.4), attacker: 1 as const };
  const { result, unmount } = renderHook(() => useDurakGame(g));
  expect(result.current.remainingSeconds).toBeNull();
  act(() => vi.advanceTimersByTime(1999));
  expect(result.current.game.revision).toBe(0);
  act(() => vi.advanceTimersByTime(1));
  expect(result.current.game.revision).toBe(1);
  expect(result.current.remainingSeconds).toBe(30);
  unmount();
  vi.restoreAllMocks();
});
it('restart cancels old decision and starts a fresh player deadline', () => {
  vi.useFakeTimers();
  const g = { ...createGame(() => 0.4), attacker: 0 as const };
  const { result, unmount } = renderHook(() => useDurakGame(g));
  act(() => vi.advanceTimersByTime(15000));
  act(() => result.current.restart(g));
  act(() => vi.advanceTimersByTime(10000));
  expect(result.current.game.revision).toBe(0);
  unmount();
});
it('keeps the initial Maria delay under React StrictMode', () => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const g = { ...createGame(() => 0.4), attacker: 1 as const };
  const { result, unmount } = renderHook(() => useDurakGame(g), { wrapper: StrictMode });
  act(() => vi.advanceTimersByTime(1000));
  expect(result.current.game.revision).toBe(0);
  act(() => vi.advanceTimersByTime(1000));
  expect(result.current.game.revision).toBe(1);
  unmount();
});

it('reports a finished game once, including surrender, and gives a rematch a new ID', () => {
  const completed: CompletedCardGame[] = [];
  const g = { ...createGame(() => 0.4), attacker: 0 as const };
  const { result, rerender } = renderHook(
    () => useDurakGame(g, 'maria', (match) => completed.push(match)),
    { wrapper: StrictMode },
  );
  act(() => result.current.surrender());
  rerender();
  expect(completed).toHaveLength(1);
  expect(completed[0]).toMatchObject({
    character: 'maria',
    result: 'loss',
    surrendered: true,
    caughtCheats: 0,
  });
  act(() => result.current.restart(g));
  act(() => result.current.surrender());
  expect(completed).toHaveLength(2);
  expect(completed[1]!.id).not.toBe(completed[0]!.id);
});

it('automatically finishes an empty hand after the opponent takes the last trump ace', () => {
  vi.useFakeTimers();
  const ace = { id: 'clubs-14', suit: 'clubs' as const, rank: 14 };
  const g = {
    ...createGame(() => 0.4),
    attacker: 0 as const,
    deck: [],
    hands: [
      [],
      [{ id: 'hearts-6', suit: 'hearts' as const, rank: 6 }],
    ] as Game['hands'],
    table: [{ attack: ace }],
    phase: 'taking' as const,
  };
  const { result, unmount } = renderHook(() => useDurakGame(g));
  act(() => vi.advanceTimersByTime(2999));
  expect(result.current.game.result).toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(result.current.game.result).toBe(0);
  expect(result.current.game.hands[1].map((c) => c.id)).toContain('clubs-14');
  unmount();
});
it('renews the player clock to 30 seconds after every successful defence', () => {
  vi.useFakeTimers();
  const c = (rank: number) => ({ id: `clubs-${rank}`, suit: 'clubs' as const, rank });
  const g = {
    ...createGame(() => 0.4),
    attacker: 1 as const,
    hands: [[c(8), c(9)], [c(10)]] as Game['hands'],
    table: [{ attack: c(6) }, { attack: c(7) }],
    phase: 'defend' as const,
  };
  const { result, unmount } = renderHook(() => useDurakGame(g));
  act(() => vi.advanceTimersByTime(25000));
  act(() => result.current.dispatch({ type: 'beat', cardId: 'clubs-8', target: 0 }));
  expect(result.current.remainingSeconds).toBe(30);
  act(() => vi.advanceTimersByTime(29999));
  expect(result.current.game.phase).toBe('defend');
  act(() => vi.advanceTimersByTime(1));
  expect(result.current.game.phase).toBe('taking');
  unmount();
});

it.each(['maria', 'grigory', 'arsenich', 'daria'] as const)('resolves the last unbeatable ace against %s without a finish click', opponent => {
  vi.useFakeTimers();
  const ace = { id: 'clubs-14', rank: 14, suit: 'clubs' as const };
  const response = { id: 'hearts-6', rank: 6, suit: 'hearts' as const };
  const g = { ...createGame(() => 0.4), attacker: 0 as const, trump: 'clubs' as const,
    hands: [[ace], [response]] as Game['hands'], deck: [] };
  const { result, unmount } = renderHook(() => useDurakGame(g, opponent));
  act(() => result.current.dispatch({ type: 'play', cardId: ace.id }));
  expect(result.current.game.result).toBeNull();
  act(() => vi.advanceTimersByTime(3000));
  expect(result.current.game.phase).toBe('taking');
  act(() => vi.advanceTimersByTime(3000));
  expect(result.current.game.result).toBe(0);
  unmount();
});
