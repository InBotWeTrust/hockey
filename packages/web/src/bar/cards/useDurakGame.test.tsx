import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createGame } from './rules.js';
import { useDurakGame } from './useDurakGame.js';
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('expires player action at 20 seconds once and cleans timers on unmount', () => {
  vi.useFakeTimers();
  const g = { ...createGame(() => 0.4), attacker: 0 as const };
  const { result, unmount } = renderHook(() => useDurakGame(g));
  act(() => vi.advanceTimersByTime(19999));
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
  expect(result.current.remainingSeconds).toBe(20);
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
