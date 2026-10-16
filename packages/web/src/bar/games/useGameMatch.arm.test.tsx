import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createMatch, type BarGameSnapshot } from '@hockey/game-core';
import { gameApi } from './api.js';
import { useGameMatch } from './useGameMatch.js';
vi.mock('./api.js', () => ({ gameApi: { read: vi.fn(), command: vi.fn() } }));
afterEach(() => {
  vi.clearAllMocks();
});
it('coalesces arm motion without blocking the controls or replaying obsolete heartbeats', async () => {
  const view: BarGameSnapshot = {
    id: 'm',
    kind: 'armwrestling',
    player: 0,
    character: null,
    participants: [],
    ready: null,
    serverNow: Date.now(),
    runtime: createMatch('armwrestling', 0, Date.now(), false, 1),
  };
  vi.mocked(gameApi.read).mockResolvedValue(view);
  let resolve!: (v: BarGameSnapshot) => void;
  vi.mocked(gameApi.command)
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    )
    .mockResolvedValue(view);
  const { result, unmount } = renderHook(() => useGameMatch('m'));
  await waitFor(() => expect(result.current.view).not.toBeNull());
  const input = {
    type: 'arm-input' as const,
    seq: 1,
    supportHeld: true,
    support: 0.5,
    pressing: true,
    wrist: 'straight' as const,
  };
  act(() => result.current.send(input));
  expect(result.current.busy).toBe(false);
  act(() => {
    result.current.send({ ...input, seq: 2 });
    result.current.send({ ...input, seq: 3, pressing: false, supportHeld: false });
  });
  await act(async () => resolve(view));
  await waitFor(() => expect(gameApi.command).toHaveBeenCalledTimes(2));
  expect(vi.mocked(gameApi.command).mock.calls[1]![1].action).toMatchObject({
    seq: 3,
    pressing: false,
    supportHeld: false,
  });
  unmount();
});
it('releases local control after an unresponsive arm request instead of hanging the stream', async () => {
  vi.useFakeTimers();
  const view: BarGameSnapshot = {
    id: 'm',
    kind: 'armwrestling',
    player: 0,
    character: null,
    participants: [],
    ready: null,
    serverNow: Date.now(),
    runtime: createMatch('armwrestling', 0, Date.now(), false, 1),
  };
  vi.mocked(gameApi.read).mockResolvedValue(view);
  vi.mocked(gameApi.command).mockImplementation(() => new Promise(() => {}));
  const { result, unmount } = renderHook(() => useGameMatch('m'));
  await act(async () => {});
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  act(() =>
    result.current.send({
      type: 'arm-input',
      seq: 1,
      supportHeld: true,
      support: 0.5,
      pressing: true,
      wrist: 'straight',
    }),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1100);
  });
  expect(result.current.armBlocked).toBe(true);
  expect(result.current.error).toContain('Связь прервалась');
  unmount();
  vi.useRealTimers();
});
