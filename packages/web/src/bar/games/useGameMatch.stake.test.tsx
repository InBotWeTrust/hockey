import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createMatch, type BarGameSnapshot } from '@hockey/game-core';
import { queryClient } from '../../app/queryClient.js';
import { gameApi } from './api.js';
import { useGameMatch } from './useGameMatch.js';
vi.mock('./api.js', () => ({ gameApi: { read: vi.fn(), command: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  queryClient.clear();
});
it('invalidates cached balances once after debit and once after settlement', async () => {
  vi.useFakeTimers();
  const v: BarGameSnapshot = {
    id: 'stake',
    kind: 'ochko',
    character: 'grigory',
    player: 0,
    participants: [],
    ready: null,
    serverNow: Date.now(),
    stake: { amount: 20, payout: null },
    runtime: createMatch('ochko', 0, Date.now(), true, 1),
  };
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  vi.mocked(gameApi.read).mockResolvedValue(v);
  renderHook(() => useGameMatch('stake'));
  await act(async () => {});
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['profile'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory'] });
  expect(invalidate).toHaveBeenCalledTimes(2);
  vi.mocked(gameApi.read).mockResolvedValue({
    ...v,
    stake: { amount: 20, payout: 40 },
    runtime: { ...v.runtime, revision: 1 },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(invalidate).toHaveBeenCalledTimes(4);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(invalidate).toHaveBeenCalledTimes(4);
});
