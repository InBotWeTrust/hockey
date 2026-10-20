import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { createMatch, type BarGameSnapshot } from '@hockey/game-core';
import { gameApi } from './api.js';
import { useGameMatch } from './useGameMatch.js';
vi.mock('./api.js', () => ({ gameApi: { read: vi.fn(), command: vi.fn() } }));
it('serializes a shot behind an in-flight aim using the confirmed revision', async () => {
  const view: BarGameSnapshot = {
    id: 'match',
    kind: 'billiards',
    player: 0,
    character: null,
    participants: [],
    ready: null,
    serverNow: Date.now(),
    runtime: createMatch('billiards', 0, Date.now(), false, 1),
  };
  vi.mocked(gameApi.read).mockResolvedValue(view);
  let resolveAim!: (v: BarGameSnapshot) => void;
  vi.mocked(gameApi.command)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAim = resolve;
        }),
    )
    .mockResolvedValue({ ...view, runtime: { ...view.runtime, revision: 2 } });
  const { result, unmount } = renderHook(() => useGameMatch('match'));
  await waitFor(() => expect(result.current.view).not.toBeNull());
  act(() => result.current.send({ type: 'aim', angle: 1, power: 0.5 }));
  expect(result.current.busy).toBe(false);
  act(() => result.current.send({ type: 'shot', angle: 1, power: 0.8 }));
  await act(async () => resolveAim({ ...view, runtime: { ...view.runtime, revision: 1 } }));
  await waitFor(() => expect(gameApi.command).toHaveBeenCalledTimes(2));
  expect(vi.mocked(gameApi.command).mock.calls[1]?.[1]).toMatchObject({
    revision: 1,
    action: { type: 'shot', power: 0.8 },
  });
  unmount();
});
