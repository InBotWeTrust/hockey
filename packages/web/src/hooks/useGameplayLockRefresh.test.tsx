import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGameplayLockRefresh } from './useGameplayLockRefresh.js';
import { useDailyStore } from '../stores/dailyStore.js';
import { useTrainingSessionStore } from '../stores/trainingSessionStore.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('refreshes duel queries and both game stores when the server lock expires', async () => {
  vi.useFakeTimers();
  const queryClient = new QueryClient();
  queryClient.setQueryData(['amateur-duel', 'matches'], { matches: [] });
  const daily = vi.spyOn(useDailyStore.getState(), 'refresh').mockResolvedValue(undefined);
  const training = vi
    .spyOn(useTrainingSessionStore.getState(), 'refresh')
    .mockResolvedValue(undefined);
  const endsAt = new Date(Date.now() + 1000).toISOString();
  function Lock() {
    useGameplayLockRefresh({
      blocked: true,
      reason: 'recent_gameplay',
      ends_at: endsAt,
      tournament_starts_at: null,
    });
    return null;
  }
  render(
    <QueryClientProvider client={queryClient}>
      <Lock />
    </QueryClientProvider>,
  );
  expect(queryClient.getQueryState(['amateur-duel', 'matches'])?.isInvalidated).toBe(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1100);
  });
  expect(queryClient.getQueryState(['amateur-duel', 'matches'])?.isInvalidated).toBe(true);
  expect(daily).toHaveBeenCalledOnce();
  expect(training).toHaveBeenCalledOnce();
});

it('refreshes the other modes when polling observes tournament completion', () => {
  const queryClient = new QueryClient();
  const daily = vi.spyOn(useDailyStore.getState(), 'refresh').mockResolvedValue(undefined);
  const training = vi
    .spyOn(useTrainingSessionStore.getState(), 'refresh')
    .mockResolvedValue(undefined);
  function Lock({ blocked }: { blocked: boolean }) {
    useGameplayLockRefresh(
      blocked
        ? { blocked, reason: 'active_classic', ends_at: null, tournament_starts_at: null }
        : null,
    );
    return null;
  }
  const view = render(
    <QueryClientProvider client={queryClient}>
      <Lock blocked />
    </QueryClientProvider>,
  );
  expect(daily).not.toHaveBeenCalled();
  view.rerender(
    <QueryClientProvider client={queryClient}>
      <Lock blocked={false} />
    </QueryClientProvider>,
  );
  expect(daily).toHaveBeenCalledOnce();
  expect(training).toHaveBeenCalledOnce();
});

it('polls completion-bound locks every 30 seconds and refreshes on return to the hub', async () => {
  vi.useFakeTimers();
  const queryClient = new QueryClient();
  queryClient.setQueryData(['tournaments', 'classic', 'active'], { games: [] });
  const daily = vi.spyOn(useDailyStore.getState(), 'refresh').mockResolvedValue(undefined);
  vi.spyOn(useTrainingSessionStore.getState(), 'refresh').mockResolvedValue(undefined);
  function Lock() {
    useGameplayLockRefresh({
      blocked: true,
      reason: 'active_classic',
      ends_at: null,
      tournament_starts_at: null,
    });
    return null;
  }
  const view = render(
    <QueryClientProvider client={queryClient}>
      <Lock />
    </QueryClientProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(daily).toHaveBeenCalledOnce();
  expect(queryClient.getQueryState(['tournaments', 'classic', 'active'])?.isInvalidated).toBe(true);
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
  expect(daily).toHaveBeenCalledTimes(2);
  view.unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(daily).toHaveBeenCalledTimes(2);
});
