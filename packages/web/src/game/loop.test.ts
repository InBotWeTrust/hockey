import { describe, expect, it, vi } from 'vitest';
import type { Ticker } from 'pixi.js';
import { createGameLoop } from './loop.js';

function makeLoop(overrides: Partial<Parameters<typeof createGameLoop>[0]> = {}) {
  return createGameLoop({
    goalRenderer: { update: vi.fn() } as never,
    goalieRenderer: { update: vi.fn() } as never,
    playerRenderer: { update: vi.fn() } as never,
    puckRenderer: {
      isHeld: () => false,
      isFlying: () => false,
      resetAtStart: vi.fn(),
      update: vi.fn(),
    } as never,
    getScale: () => ({ factor: 1, offsetX: 0, offsetY: 0 }),
    getSeed: () => 'seed',
    getShotIndex: () => 1,
    getGoalieId: () => null,
    ...overrides,
  });
}

type TestTicker = Ticker & {
  add: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  elapsedMS: number;
};

function makeTicker(): TestTicker {
  return {
    add: vi.fn(),
    remove: vi.fn(),
    elapsedMS: 16,
  } as unknown as TestTicker;
}

describe('createGameLoop', () => {
  it('does not add the same ticker callback twice', () => {
    const loop = makeLoop();
    const ticker = makeTicker();

    loop.attach(ticker);
    loop.attach(ticker);

    expect(ticker.add).toHaveBeenCalledTimes(1);
  });

  it('keeps detach idempotent when Pixi has already removed the callback', () => {
    const loop = makeLoop();
    const ticker = makeTicker();
    ticker.remove.mockImplementation(() => {
      throw new TypeError("Cannot read properties of null (reading 'next')");
    });

    loop.attach(ticker);

    expect(() => loop.detach()).not.toThrow();
    expect(() => loop.detach()).not.toThrow();
  });

  it('starts from the provided session elapsed time', () => {
    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValue(1000);
    const loop = makeLoop({ getInitialElapsedMs: () => 5000, getGoalieId: () => 'rookie' });
    const ticker = makeTicker();

    expect(loop.getSceneT()).toBe(5000);

    nowSpy.mockReturnValue(1250);
    ticker.elapsedMS = 16;
    loop.attach(ticker);
    const onTick = ticker.add.mock.calls[0]?.[0] as ((ticker: Ticker) => void) | undefined;
    onTick?.(ticker);

    expect(loop.getSceneT()).toBe(5016);
    expect(loop.getRenderNow()).toBe(1016);

    nowSpy.mockRestore();
  });

  it('caps large render steps so one dropped frame does not jump moving sprites', () => {
    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValue(1000);
    const goalUpdate = vi.fn();
    const goalieUpdate = vi.fn();
    const playerUpdate = vi.fn();
    const loop = makeLoop({
      goalRenderer: { update: goalUpdate } as never,
      goalieRenderer: { update: goalieUpdate } as never,
      playerRenderer: { update: playerUpdate } as never,
      getGoalieId: () => 'rookie',
    });
    const ticker = makeTicker();

    loop.attach(ticker);
    const onTick = ticker.add.mock.calls[0]?.[0] as ((ticker: Ticker) => void) | undefined;
    expect(onTick).toBeDefined();

    ticker.elapsedMS = 120;
    onTick?.(ticker);

    expect(loop.getSceneT()).toBe(34);

    nowSpy.mockRestore();
  });
});
