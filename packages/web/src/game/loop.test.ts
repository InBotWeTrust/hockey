import { describe, expect, it, vi } from 'vitest';
import type { Ticker } from 'pixi.js';
import type { GoalieConfig } from '@hockey/game-core';
import { createGameLoop } from './loop.js';

const stationaryCustomGoalie: GoalieConfig = {
  id: 'bonus:beach:p1',
  name: 'Пляж',
  pattern: 'linear',
  hp: 0,
  baseReward: 0,
  firstClearBonus: 0,
  speed: 0,
  amplitude: 0,
  frequency: 0.5,
  goalAmplitude: 0,
  goalFrequency: 0.45,
};

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
  it('renders the supplied goalie configuration when no goalie id is available', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const scale = { factor: 1, offsetX: 0, offsetY: 0 };
    const goalUpdate = vi.fn();
    const goalieUpdate = vi.fn();
    const loop = makeLoop({
      goalRenderer: { update: goalUpdate } as never,
      goalieRenderer: { update: goalieUpdate } as never,
      getScale: () => scale,
      getGoalieConfig: () => stationaryCustomGoalie,
    });
    const ticker = makeTicker();

    loop.attach(ticker);
    const onTick = ticker.add.mock.calls[0]?.[0] as (ticker: Ticker) => void;
    onTick(ticker);

    expect(goalUpdate).toHaveBeenCalledWith(scale, 0);
    expect(goalieUpdate).toHaveBeenCalledWith(
      { position: { x: 286, y: 78 }, width: 58, height: 28 },
      scale,
    );
    nowSpy.mockRestore();
  });

  it('prefers the supplied goalie configuration over a valid goalie id', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const scale = { factor: 1, offsetX: 0, offsetY: 0 };
    const goalUpdate = vi.fn();
    const goalieUpdate = vi.fn();
    const loop = makeLoop({
      goalRenderer: { update: goalUpdate } as never,
      goalieRenderer: { update: goalieUpdate } as never,
      getScale: () => scale,
      getGoalieId: () => 'rookie',
      getGoalieConfig: () => stationaryCustomGoalie,
    });
    const ticker = makeTicker();

    loop.attach(ticker);
    const onTick = ticker.add.mock.calls[0]?.[0] as (ticker: Ticker) => void;
    onTick(ticker);

    expect(goalUpdate).toHaveBeenCalledWith(scale, 0);
    expect(goalieUpdate).toHaveBeenCalledWith(
      { position: { x: 286, y: 78 }, width: 58, height: 28 },
      scale,
    );
    nowSpy.mockRestore();
  });

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

  it('starts scene and shooter from separate authoritative clocks', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const loop = makeLoop({
      getInitialClocks: () => ({ sceneElapsedMs: 5_000, shooterElapsedMs: 3_500 }),
    });

    expect(loop.getSceneT()).toBe(5_000);
    expect(loop.getShooterT()).toBe(3_500);
    nowSpy.mockRestore();
  });

  it('accounts for the intended flight pause instead of accumulated timer delay', () => {
    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValue(1_000);
    const loop = makeLoop({ getGoalieConfig: () => stationaryCustomGoalie });
    const ticker = makeTicker();
    loop.attach(ticker);
    const onTick = ticker.add.mock.calls[0]?.[0] as ((ticker: Ticker) => void) | undefined;

    nowSpy.mockReturnValue(1_100);
    onTick?.(ticker);
    loop.beginShooterPause();

    // The browser delivered a nominal 433 ms flight timer late. Bonus-game
    // anti-cheat validates the nominal flight pause, not event-loop jitter.
    nowSpy.mockReturnValue(1_700);
    onTick?.(ticker);
    (loop.endShooterPause as (expectedDurationMs?: number) => void)(433);

    expect(loop.getSceneT()).toBe(700);
    expect(loop.getShooterT()).toBe(267);
    nowSpy.mockRestore();
  });

  it('rebases scene and shooter clocks independently after reconciliation', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const loop = makeLoop({ getInitialElapsedMs: () => 500 });

    (
      loop as unknown as {
        rebaseTime?: (clocks: { sceneElapsedMs: number; shooterElapsedMs: number }) => void;
      }
    ).rebaseTime?.({ sceneElapsedMs: 8_000, shooterElapsedMs: 6_500 });

    expect(loop.getSceneT()).toBe(8_000);
    expect(loop.getShooterT()).toBe(6_500);
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
    expect(playerUpdate.mock.calls.at(-1)?.[3]).toEqual({
      resting: false,
      stumbling: true,
    });

    nowSpy.mockReturnValue(6200);
    onTick?.(ticker);
    expect(playerUpdate.mock.calls.at(-1)?.[1]).toBe(stumbleStartX);
    expect(playerUpdate.mock.calls.at(-1)?.[3]).toEqual({
      resting: false,
      stumbling: true,
    });

    nowSpy.mockReturnValue(6600);
    onTick?.(ticker);
    expect(playerUpdate.mock.calls.at(-1)?.[1]).toBe(stumbleStartX);

    nowSpy.mockReturnValue(6800);
    onTick?.(ticker);
    expect(playerUpdate.mock.calls.at(-1)?.[1]).toBe(stumbleStartX);

    nowSpy.mockReturnValue(7000);
    onTick?.(ticker);
    expect(playerUpdate.mock.calls.at(-1)?.[1]).toBe(stumbleStartX);

    nowSpy.mockReturnValue(7450);
    onTick?.(ticker);
    expect(playerUpdate.mock.calls.at(-1)?.[1]).toBe(stumbleStartX);

    nowSpy.mockReturnValue(7600);
    onTick?.(ticker);
    expect(playerUpdate.mock.calls.at(-1)?.[1]).not.toBe(stumbleStartX);
    expect(playerUpdate.mock.calls.at(-1)?.[3]).toEqual({
      resting: false,
      stumbling: false,
    });

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
    expect(playerUpdate.mock.calls.at(-1)?.[3]).toEqual({
      resting: true,
      stumbling: false,
    });

    nowSpy.mockReturnValue(6200);
    onTick?.(ticker);
    expect(playerUpdate.mock.calls.at(-1)?.[1]).toBe(restStartX);
    expect(playerUpdate.mock.calls.at(-1)?.[3]).toEqual({
      resting: true,
      stumbling: false,
    });

    nowSpy.mockReturnValue(6600);
    onTick?.(ticker);
    expect(playerUpdate.mock.calls.at(-1)?.[1]).toBe(restStartX);

    nowSpy.mockReturnValue(6800);
    onTick?.(ticker);
    expect(playerUpdate.mock.calls.at(-1)?.[1]).toBe(restStartX);

    nowSpy.mockReturnValue(7000);
    onTick?.(ticker);
    expect(playerUpdate.mock.calls.at(-1)?.[1]).not.toBe(restStartX);
    expect(playerUpdate.mock.calls.at(-1)?.[3]).toEqual({
      resting: false,
      stumbling: false,
    });

    nowSpy.mockRestore();
  });

  it('freezes shooter movement even when the first rendered duel frame is paused', () => {
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
      getDuelCondition: () => ({
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
      }),
    });
    const ticker = makeTicker();

    loop.attach(ticker);
    const onTick = ticker.add.mock.calls[0]?.[0] as ((ticker: Ticker) => void) | undefined;
    expect(onTick).toBeDefined();

    nowSpy.mockReturnValue(2000);
    onTick?.(ticker);
    const firstPausedX = playerUpdate.mock.calls.at(-1)?.[1] as number;

    nowSpy.mockReturnValue(2123);
    onTick?.(ticker);
    expect(playerUpdate.mock.calls.at(-1)?.[1]).toBe(firstPausedX);

    nowSpy.mockReturnValue(2456);
    onTick?.(ticker);
    expect(playerUpdate.mock.calls.at(-1)?.[1]).toBe(firstPausedX);

    nowSpy.mockRestore();
  });

  it('keeps reporting the latest paused duel condition while frozen', () => {
    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValue(1000);
    const onDuelConditionChange = vi.fn();
    const loop = makeLoop({
      getGoalieId: () => 'rookie',
      getSpeedOverrides: () => ({
        goalFreq: 1,
        goalieFreq: 1,
        shooterFreq: 1,
        puckSpeed: 1,
      }),
      getDuelCondition: () => ({
        puckSpeedDelta: 0,
        shooterSpeedMultiplier: 0,
        canShoot: false,
        status: 'exhausted_stop',
        fatigueLevel: 'resting',
        stumbleActive: false,
        shooterXOffsetPx: 0,
        fatigueMs: 90_000,
        nutritionConsumed: 0,
        skatesConsumed: 0,
      }),
      onDuelConditionChange,
    });
    const ticker = makeTicker();

    loop.attach(ticker);
    const onTick = ticker.add.mock.calls[0]?.[0] as ((ticker: Ticker) => void) | undefined;
    expect(onTick).toBeDefined();

    nowSpy.mockReturnValue(2000);
    onTick?.(ticker);
    nowSpy.mockReturnValue(2400);
    onTick?.(ticker);

    expect(onDuelConditionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'exhausted_stop', canShoot: false }),
    );

    nowSpy.mockRestore();
  });

  it('keeps stumble active for the visible notice window after the core window ends', () => {
    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValue(1000);
    const playerUpdate = vi.fn();
    const onDuelConditionChange = vi.fn();
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
        elapsedMs < 510
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
          : {
              puckSpeedDelta: 0,
              shooterSpeedMultiplier: 1,
              canShoot: true,
              status: 'normal',
              fatigueLevel: 'none',
              stumbleActive: false,
              shooterXOffsetPx: 0,
              fatigueMs: 0,
              nutritionConsumed: 0,
              skatesConsumed: 0,
            },
      onDuelConditionChange,
    });
    const ticker = makeTicker();

    loop.attach(ticker);
    const onTick = ticker.add.mock.calls[0]?.[0] as ((ticker: Ticker) => void) | undefined;
    expect(onTick).toBeDefined();

    nowSpy.mockReturnValue(1500);
    onTick?.(ticker);
    const stumbleX = playerUpdate.mock.calls.at(-1)?.[1] as number;

    nowSpy.mockReturnValue(1700);
    onTick?.(ticker);

    expect(playerUpdate.mock.calls.at(-1)?.[1]).toBe(stumbleX);
    expect(onDuelConditionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'stumble', canShoot: false }),
    );

    nowSpy.mockRestore();
  });

  it('does not jump when exhausted rest starts after slowed fatigue', () => {
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
      getDuelCondition: (elapsedMs) => {
        if (elapsedMs >= 6001 && elapsedMs < 6800) {
          return {
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
          };
        }
        if (elapsedMs >= 5000) {
          return {
            puckSpeedDelta: 0,
            shooterSpeedMultiplier: 0.9,
            canShoot: true,
            status: 'tired',
            fatigueLevel: 'medium',
            stumbleActive: false,
            shooterXOffsetPx: 0,
            fatigueMs: elapsedMs,
            nutritionConsumed: 0,
            skatesConsumed: 0,
          };
        }
        return null;
      },
    });
    const ticker = makeTicker();

    loop.attach(ticker);
    const onTick = ticker.add.mock.calls[0]?.[0] as ((ticker: Ticker) => void) | undefined;
    expect(onTick).toBeDefined();

    nowSpy.mockReturnValue(6000);
    onTick?.(ticker);
    const tiredX = playerUpdate.mock.calls.at(-1)?.[1] as number;

    nowSpy.mockReturnValue(6001);
    onTick?.(ticker);
    const restStartX = playerUpdate.mock.calls.at(-1)?.[1] as number;

    expect(Math.abs(restStartX - tiredX)).toBeLessThan(1);

    nowSpy.mockRestore();
  });

  it('reports duel condition from the same tick that drives the player', () => {
    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValue(1000);
    const onDuelConditionChange = vi.fn();
    const loop = makeLoop({
      getGoalieId: () => 'rookie',
      getSpeedOverrides: () => ({
        goalFreq: 1,
        goalieFreq: 1,
        shooterFreq: 1,
        puckSpeed: 1,
      }),
      getDuelCondition: (elapsedMs) =>
        elapsedMs >= 5000
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
      onDuelConditionChange,
    });
    const ticker = makeTicker();

    loop.attach(ticker);
    const onTick = ticker.add.mock.calls[0]?.[0] as ((ticker: Ticker) => void) | undefined;
    expect(onTick).toBeDefined();

    nowSpy.mockReturnValue(5999);
    onTick?.(ticker);
    nowSpy.mockReturnValue(6000);
    onTick?.(ticker);

    expect(onDuelConditionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'stumble', stumbleActive: true }),
    );

    nowSpy.mockRestore();
  });
});
