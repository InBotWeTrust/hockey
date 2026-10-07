import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpectatorRink } from './SpectatorRink.js';
import { ReplayBuffer } from './replay.js';
import type { BarPlayer } from './types.js';

const mocks = vi.hoisted(() => {
  const actors: Array<{ update: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }> = [];
  const app = {
    start: vi.fn(),
    stop: vi.fn(),
    stage: { addChild: vi.fn() },
    ticker: { maxFPS: 60, add: vi.fn() },
  };
  class Actor {
    container = {};
    update = vi.fn();
    destroy = vi.fn();
    resetAtStart = vi.fn();
    setSavePose = vi.fn();
    constructor() {
      actors.push(this);
    }
  }
  return { actors, app, Actor };
});
vi.mock('../game/renderer/Player.js', () => ({ Player: mocks.Actor }));
vi.mock('../game/renderer/Goal.js', () => ({ Goal: mocks.Actor }));
vi.mock('../game/renderer/Goalie.js', () => ({ Goalie: mocks.Actor }));
vi.mock('../game/renderer/Puck.js', () => ({ Puck: mocks.Actor }));
vi.mock('../game/PixiStage.js', async () => {
  const { useEffect } = await import('react');
  return {
    PixiStage: ({ onReady }: { onReady: (app: unknown, scale: unknown) => void }) => {
      useEffect(() => {
        onReady(mocks.app, { factor: 1, offsetX: 0, offsetY: 0 });
      }, []);
      return null;
    },
  };
});
const player: BarPlayer = {
  userId: 'a',
  name: 'Игрок',
  avatarUrl: null,
  grip: 'left',
  goals: 0,
  state: 'period_active',
  period: 1,
  until: null,
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  mocks.actors.length = 0;
});
describe('spectator scene lifecycle', () => {
  it('keeps the scene on score updates, stops when hidden and destroys actors when leaving', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const buffer = new ReplayBuffer();
    const view = render(<SpectatorRink player={player} buffer={buffer} />);
    expect(mocks.app.ticker.maxFPS).toBe(30);
    expect(mocks.actors).toHaveLength(4);
    view.rerender(<SpectatorRink player={{ ...player, goals: 1 }} buffer={buffer} />);
    expect(mocks.actors).toHaveLength(4);
    hidden.mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(mocks.app.stop).toHaveBeenCalledOnce();
    hidden.mockReturnValue(false);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(mocks.app.start).toHaveBeenCalledOnce();
    view.unmount();
    for (const actor of mocks.actors) expect(actor.destroy).toHaveBeenCalledOnce();
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(mocks.app.start).toHaveBeenCalledOnce();
  });
});
