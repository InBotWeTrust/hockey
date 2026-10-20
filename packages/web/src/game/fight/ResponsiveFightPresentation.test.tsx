import { act, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { advanceFight, createFightState, DEFAULT_FIGHT_RULES } from '@hockey/game-core';
import { ResponsiveFightView } from './ResponsiveFightView.js';
const updates = vi.hoisted(() => [vi.fn(), vi.fn()]);
const app = vi.hoisted(() => ({
  screen: { width: 360, height: 500 },
  canvas: { parentElement: null },
  stage: { addChild: () => {} },
  renderer: { resize: () => {} },
}));
vi.mock('pixi.js', () => ({ Assets: { load: async () => {} } }));
vi.mock('../PixiStage.js', () => ({
  PixiStage: ({ onReady }: { onReady: (a: unknown) => void }) => {
    useEffect(() => {
      onReady(app);
    }, []);
    return null;
  },
}));
vi.mock('./Fighter.js', () => ({
  FIGHT_ASSETS: [],
  Fighter: class {
    view = { x: 0, y: 0, position: { set: () => {} } };
    targets = { head: { x: 0, y: 0 }, body: { x: 0, y: 0 } };
    update: (typeof updates)[number];
    constructor(side: number) {
      this.update = updates[side]!;
    }
  },
}));
it('presents a late confirmed strike before the hit reaction instead of replacing it with idle', async () => {
  let tick: FrameRequestCallback = () => {};
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    tick = fn;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const time = vi.spyOn(performance, 'now').mockReturnValue(1000);
  const state = createFightState(DEFAULT_FIGHT_RULES, 0);
  const props = { player: 0 as const, onAction: () => {}, nowMs: 1000 };
  const view = render(<ResponsiveFightView {...props} state={state} />);
  await act(async () => {
    await Promise.resolve();
  });
  const hit = advanceFight(
    state,
    [
      {
        kind: 'attack',
        zone: 'head',
        player: 0,
        seq: 1,
        phaseId: 0,
        effectiveAtMs: 1000,
        actionId: 'late',
      },
    ],
    1400,
  ).state;
  view.rerender(<ResponsiveFightView {...props} state={hit} nowMs={3000} />);
  act(() => tick(1000));
  expect(updates[0]!.mock.calls.at(-1)?.[0]).toBe('attack_head');
  time.mockReturnValue(1080);
  act(() => tick(1080));
  expect(updates[1]!.mock.calls.at(-1)?.[0]).toBe('hit');
  view.unmount();
  time.mockRestore();
  vi.unstubAllGlobals();
});
