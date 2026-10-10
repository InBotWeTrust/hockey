import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useDurakGame } from './useDurakGame.js';
import { createGame, legalActions } from './rules.js';
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function fixture() {
  const g = createGame(() => 0.4);
  g.attacker = 1;
  g.phase = 'attack';
  g.table = [{ attack: g.hands[1].shift()!, defence: g.hands[0].shift()! }];
  return g;
}
it('catch restores only the illegal card; another attempt cannot immediately repeat', () => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const g = fixture();
  const { result } = renderHook(() => useDurakGame(g, 'grigory'), { wrapper: StrictMode });
  act(() => vi.advanceTimersByTime(4000));
  expect(result.current.game.table.length).toBe(2);
  act(() => {
    expect(result.current.challengeCheat?.()).toBe(true);
  });
  expect(result.current.game.hands).toEqual(g.hands);
  expect(result.current.game.deck).toEqual(g.deck);
  expect(result.current.game.table).toEqual(g.table);
  act(() => vi.advanceTimersByTime(1200));
  const ranks = g.table.flatMap((p) => [p.attack.rank, p.defence!.rank]);
  const extra = result.current.game.table[1];
  if (extra) expect(ranks).toContain(extra.attack.rank);
});
it('a legal player response accepts the staged card and closes the catch window', () => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const { result } = renderHook(() => useDurakGame(fixture(), 'grigory'));
  act(() => vi.advanceTimersByTime(4000));
  act(() =>
    result.current.dispatch(legalActions(result.current.game, 0).find((a) => a.type === 'take')!),
  );
  act(() => {
    expect(result.current.challengeCheat?.()).toBe(false);
  });
});

it('timeout accepts the card; restart closes the old cheating window and clears timers', () => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const { result, unmount } = renderHook(() => useDurakGame(fixture(), 'grigory'));
  act(() => vi.advanceTimersByTime(4000));
  act(() => vi.advanceTimersByTime(20000));
  expect(result.current.game.phase).toBe('taking');
  act(() => {
    expect(result.current.challengeCheat?.()).toBe(false);
  });
  act(() => result.current.restart(fixture()));
  act(() => vi.advanceTimersByTime(2000));
  act(() => {
    expect(result.current.challengeCheat?.()).toBe(true);
  });
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
