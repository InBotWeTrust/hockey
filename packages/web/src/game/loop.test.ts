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

    expect(loop.getSceneT()).toBe(5250);
    expect(loop.getRenderNow()).toBe(1250);

    nowSpy.mockRestore();
  });

  it('keeps moving sprites aligned with real time after a dropped frame', () => {
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
    nowSpy.mockReturnValue(1120);
    onTick?.(ticker);

    expect(loop.getSceneT()).toBe(120);

    nowSpy.mockRestore();
  });

  it('keeps simulation time aligned with real elapsed time on slow frames', () => {
    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValue(1000);
    const loop = makeLoop({ getGoalieId: () => 'rookie' });
    const ticker = makeTicker();

    loop.attach(ticker);
    const onTick = ticker.add.mock.calls[0]?.[0] as ((ticker: Ticker) => void) | undefined;
    expect(onTick).toBeDefined();

    nowSpy.mockReturnValue(1120);
    ticker.elapsedMS = 120;
    onTick?.(ticker);

    expect(loop.getSceneT()).toBe(120);
    expect(loop.getRenderNow()).toBe(1120);

    nowSpy.mockRestore();
  });

  it('freezes shooter movement during a duel stumble without jumping on recovery', () => {
    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValue(1000);
    const playerUpdate = vi.fn();
    const loop = makeLoop({
      playerRenderer: { update: playerUpdate } as never,
      getGoalieId: () => 'rookie',
      getSpeedOverrides: () => ({
        goalFreq: 1,
        goalieFreq: 1,
        shooterFreq: 1,
        puckSpeed: 1,
      }),
      getDuelCondition: (elapsedMs) =>
        elapsedMs >= 5000 && elapsedMs < 5800
          ? {
              puckSpeedDelta: 0,
              shooterSpeedMultiplier: 1,
              canShoot: false,
              status: 'stumble',
              fatigueLevel: 'none',
              stumbleActive: true,
              shooterXOffsetPx: 0,
              fatigueMs: 0,
              nutritionConsumed: 0,
              skatesConsumed: 0,
            }
          : null,
    });
    const ticker = makeTicker();

    loop.attach(ticker);
    const onTick = ticker.add.mock.calls[0]?.[0] as ((ticker: Ticker) => void) | undefined;
    expect(onTick).toBeDefined();

    nowSpy.mockReturnValue(6000);
    onTick?.(ticker);
    const stumbleStartX = playerUpdate.mock.calls.at(-1)?.[1] as number;

    nowSpy.mockReturnValue(6200);
    onTick?.(ticker);
    expect(playerUpdate.mock.calls.at(-1)?.[1]).toBe(stumbleStartX);

    nowSpy.mockReturnValue(6600);
    onTick?.(ticker);
    expect(playerUpdate.mock.calls.at(-1)?.[1]).toBe(stumbleStartX);

    nowSpy.mockReturnValue(6800);
    onTick?.(ticker);
    expect(playerUpdate.mock.calls.at(-1)?.[1]).toBe(stumbleStartX);

    nowSpy.mockReturnValue(7000);
    onTick?.(ticker);
    expect(playerUpdate.mock.calls.at(-1)?.[1]).not.toBe(stumbleStartX);

    nowSpy.mockRestore();
  });

  it('freezes shooter movement during exhausted rest', () => {
    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValue(1000);
    const playerUpdate = vi.fn();
    const loop = makeLoop({
      playerRenderer: { update: playerUpdate } as never,
      getGoalieId: () => 'rookie',
      getSpeedOverrides: () => ({
        goalFreq: 1,
        goalieFreq: 1,
        shooterFreq: 1,
        puckSpeed: 1,
      }),
      getDuelCondition: (elapsedMs) =>
        elapsedMs >= 5000 && elapsedMs < 5800
          ? {
              puckSpeedDelta: 0,
              shooterSpeedMultiplier: 0,
              canShoot: false,
              status: 'exhausted_stop',
              fatigueLevel: 'resting',
              stumbleActive: false,
              shooterXOffsetPx: 0,
              fatigueMs: elapsedMs,
              nutritionConsumed: 0,
              skatesConsumed: 0,
            }
          : null,
    });
    const ticker = makeTicker();

    loop.attach(ticker);
    const onTick = ticker.add.mock.calls[0]?.[0] as ((ticker: Ticker) => void) | undefined;
    expect(onTick).toBeDefined();

    nowSpy.mockReturnValue(6000);
    onTick?.(ticker);
    const restStartX = playerUpdate.mock.calls.at(-1)?.[1] as number;

    nowSpy.mockReturnValue(6200);
    onTick?.(ticker);
    expect(playerUpdate.mock.calls.at(-1)?.[1]).toBe(restStartX);

    nowSpy.mockReturnValue(6600);
    onTick?.(ticker);
    expect(playerUpdate.mock.calls.at(-1)?.[1]).toBe(restStartX);

    nowSpy.mockReturnValue(6800);
    onTick?.(ticker);
    expect(playerUpdate.mock.calls.at(-1)?.[1]).toBe(restStartX);

    nowSpy.mockReturnValue(7000);
    onTick?.(ticker);
    expect(playerUpdate.mock.calls.at(-1)?.[1]).not.toBe(restStartX);

    nowSpy.mockRestore();
  });
});
