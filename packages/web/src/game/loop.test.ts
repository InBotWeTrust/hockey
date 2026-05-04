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

describe('createGameLoop', () => {
  it('does not add the same ticker callback twice', () => {
    const loop = makeLoop();
    const ticker = {
      add: vi.fn(),
      remove: vi.fn(),
    } as unknown as Ticker;

    loop.attach(ticker);
    loop.attach(ticker);

    expect(ticker.add).toHaveBeenCalledTimes(1);
  });

  it('keeps detach idempotent when Pixi has already removed the callback', () => {
    const loop = makeLoop();
    const ticker = {
      add: vi.fn(),
      remove: vi.fn(() => {
        throw new TypeError("Cannot read properties of null (reading 'next')");
      }),
    } as unknown as Ticker;

    loop.attach(ticker);

    expect(() => loop.detach()).not.toThrow();
    expect(() => loop.detach()).not.toThrow();
  });

  it('starts from the provided session elapsed time', () => {
    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValue(1000);
    const loop = makeLoop({ getInitialElapsedMs: () => 5000 });

    expect(loop.getSceneT()).toBe(5000);

    nowSpy.mockReturnValue(1250);
    expect(loop.getSceneT()).toBe(5250);

    nowSpy.mockRestore();
  });
});
